#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CdpConnection, validateLoopbackWebSocketUrl } from "./codex-cdp.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const defaultPort = 9232;
const defaultAppPath = "/Applications/ChatGPT.app";
const defaultProfilePath = path.join(os.homedir(), "Library", "Application Support", "Loctek Specboard", "codex-profile");
const frameLoadTimeoutMs = 35_000;

function parseArgs(argv) {
  const options = { launch: false, watch: false, open: false, port: defaultPort, appPath: defaultAppPath, profilePath: defaultProfilePath };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--launch") options.launch = true;
    else if (value === "--watch") options.watch = true;
    else if (value === "--open") options.open = true;
    else if (value === "--port") options.port = Number(argv[++index]);
    else if (value === "--app-path") options.appPath = path.resolve(argv[++index]);
    else if (value === "--profile-path") options.profilePath = path.resolve(argv[++index]);
    else if (value === "--help") return { help: true };
    else throw new Error(`未知参数：${value}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error("--port 必须是 1024 至 65535 之间的整数。");
  return options;
}

function usage() {
  return [
    "Loctek Specboard Codex Sidecar",
    "  node scripts/codex-sidecar.mjs --launch --watch --open",
    "  --launch          启动隔离 profile 的 Codex 窗口",
    "  --watch           持续重挂侧栏入口，直到 Ctrl+C",
    "  --open            启动后立即打开 Specboard",
    "  --port <number>   专用本机 CDP 端口（默认 9232）",
  ].join("\n");
}

async function fetchJson(url, timeoutMs = 2_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function cdpReachable(port) {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

async function waitForCdp(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpReachable(port)) return;
    await delay(150);
  }
  throw new Error(`等待专用 Codex 窗口超时（127.0.0.1:${port}）。`);
}

async function launchCodex(options) {
  if (await cdpReachable(options.port)) return;
  await access(options.appPath);
  const launcher = spawn("/usr/bin/open", [
    "-n",
    "-a", options.appPath,
    "--args",
    `--user-data-dir=${options.profilePath}`,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${options.port}`,
    `--remote-allow-origins=http://127.0.0.1:${options.port}`,
  ], { stdio: "ignore", env: sanitizedEnvironment() });
  await new Promise((resolve, reject) => {
    launcher.once("error", reject);
    launcher.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`无法启动专用 Codex 窗口：${signal || code}`)));
  });
  await waitForCdp(options.port);
}

function sanitizedEnvironment() {
  const environment = { ...process.env };
  [
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "LOCTEK_SPECBOARD_URL",
  ].forEach((name) => delete environment[name]);
  return environment;
}

async function targets(port) {
  const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  return list.filter((target) => (
    target.type === "page"
    && !target.url?.includes("initialRoute=%2Favatar-overlay")
    && (target.url?.startsWith("app://") || /codex/i.test(target.title || ""))
  )).map((target) => ({ ...target, webSocketDebuggerUrl: validateLoopbackWebSocketUrl(target.webSocketDebuggerUrl, port) }));
}

function ensureLocalBoardUrl(value) {
  const url = new URL(value || "http://127.0.0.1:47932/");
  if (!(["127.0.0.1", "localhost"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol))) {
    throw new Error("Specboard 地址只能是本机 localhost / 127.0.0.1。");
  }
  return url.origin;
}

async function injectionSource() {
  const [runtime, app, markup, styles] = await Promise.all([
    readFile(path.join(root, "inject", "specboard.user.js"), "utf8"),
    readFile(path.join(root, "public", "app.js"), "utf8"),
    readFile(path.join(root, "public", "index.html"), "utf8"),
    readFile(path.join(root, "public", "style.css"), "utf8"),
  ]);
  // Rebuild the embedded page whenever either its host injection or any board
  // asset changes. Hashing only the sidebar script left an already-open Codex
  // window on a stale iframe after normal UI development.
  const sourceHash = createHash("sha256").update(runtime).update(app).update(markup).update(styles).digest("hex");
  const boardUrl = ensureLocalBoardUrl(process.env.LOCTEK_SPECBOARD_URL || "http://127.0.0.1:47932/");
  return {
    sourceHash,
    source: `window.__LOCTEK_SPECBOARD_URL__ = ${JSON.stringify(`${boardUrl}/?host=codex`)};\nwindow.__LOCTEK_SPECBOARD_SOURCE_HASH__ = ${JSON.stringify(sourceHash)};\n${runtime}\n//# sourceURL=loctek-specboard.user.js`,
  };
}

async function injectTarget(target, source, sourceHash, shouldOpen, registerSource) {
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.setBypassCSP", { enabled: true });
    const current = await cdp.send("Runtime.evaluate", {
      expression: "window.__loctekSpecboardInjection__?.sourceHash || null",
      returnByValue: true,
    });
    if (registerSource && current.result.value !== sourceHash) {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source });
    }
    const evaluation = await cdp.send("Runtime.evaluate", { expression: source, awaitPromise: true, returnByValue: true });
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || "侧栏入口注入失败。");
    if (shouldOpen) {
      await cdp.send("Runtime.evaluate", {
        expression: "(() => { window.__loctekSpecboardInjection__?.open?.(); return window.__loctekSpecboardInjection__?.reloadFrame?.(); })()",
        returnByValue: true,
      });
      await cdp.send("Page.bringToFront");
      await loadBoardFrame(cdp);
    }
    const boardState = await cdp.send("Runtime.evaluate", {
      expression: "({ visible: document.getElementById('loctek-specboard-page')?.hidden === false, loaded: document.getElementById('loctek-specboard-frame')?.dataset.loctekSpecboardLoaded === 'true' })",
      returnByValue: true,
    });
    if (boardState.result.value?.visible && !boardState.result.value.loaded) await loadBoardFrame(cdp);
    const status = await cdp.send("Runtime.evaluate", {
      expression: "({ entryMounted: Boolean(document.getElementById('loctek-specboard-entry')), version: window.__loctekSpecboardInjection__?.version || null })",
      returnByValue: true,
    });
    return status.result.value;
  } finally {
    cdp.close();
  }
}

async function targetState(target) {
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.send("Runtime.enable");
    const result = await cdp.send("Runtime.evaluate", {
      expression: "({ sourceHash: window.__loctekSpecboardInjection__?.sourceHash || null, visible: document.getElementById('loctek-specboard-page')?.hidden === false, loaded: document.getElementById('loctek-specboard-frame')?.dataset.loctekSpecboardLoaded === 'true' })",
      returnByValue: true,
    });
    return result.result.value || {};
  } finally {
    cdp.close();
  }
}

async function codexLocalProjects(target) {
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.send("Runtime.enable");
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        try {
          const entries = window.electronBridge?.getInitialSidebarBootstrap
            ? null
            : null;
          return window.electronBridge?.getInitialSidebarBootstrap?.();
        } catch (_) { return null; }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const entries = result.result.value?.globalStateEntries || [];
    const local = entries.find((entry) => entry?.key === "local-projects")?.value || {};
    return Object.values(local).flatMap((project) => {
      const projectPath = Array.isArray(project?.rootPaths)
        ? project.rootPaths.find((item) => typeof item === "string" && item.trim())
        : null;
      return projectPath ? [{ label: String(project.name || path.basename(projectPath)), path: projectPath }] : [];
    });
  } finally {
    cdp.close();
  }
}

async function syncCodexProjects(target) {
  const projects = await codexLocalProjects(target);
  if (projects.length === 0) return 0;
  const rootUrl = ensureLocalBoardUrl(process.env.LOCTEK_SPECBOARD_URL || "http://127.0.0.1:47932/");
  let registered = 0;
  for (const project of projects) {
    try {
      await fetch(`${rootUrl}/api/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...project, preserveExistingLabel: true }),
        signal: AbortSignal.timeout(5_000),
      });
      registered += 1;
    } catch (error) {
      process.stderr.write(`无法登记 Codex 项目 ${project.label}：${error.message}\n`);
    }
  }
  return registered;
}

function findFrameByName(frameTree, frameName) {
  if (frameTree.frame?.name === frameName) return frameTree.frame;
  for (const child of frameTree.childFrames || []) {
    const match = findFrameByName(child, frameName);
    if (match) return match;
  }
  return null;
}

async function boardDocument() {
  const boardUrl = `${ensureLocalBoardUrl(process.env.LOCTEK_SPECBOARD_URL || "http://127.0.0.1:47932/")}/?host=codex`;
  const root = new URL(boardUrl).origin;
  const response = await fetch(boardUrl, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Specboard 页面不可访问：HTTP ${response.status}`);
  let html = await response.text();
  if (!html.includes("<head>")) throw new Error("Specboard 页面缺少 <head>，无法安全嵌入。");
  html = html
    .replaceAll('href="/style.css"', `href="${root}/style.css"`)
    // The app is injected once below after CDP has written the blank frame.
    // Keeping the external tag would race the inline copy and can leave an old
    // asynchronous `load()` result visible after projects have been synced.
    .replace(/\s*<script\s+src=["']\/app\.js["'][^>]*><\/script>/i, "");
  // An about:blank CDP frame has opaque origin. Give it a real loopback base
  // path rather than inheriting Codex's app:// URL or treating ?host=codex as
  // a document path.
  const embeddedBase = new URL(boardUrl);
  embeddedBase.search = "";
  embeddedBase.hash = "";
  embeddedBase.pathname = "/";
  return html.replace("<head>", `<head><base href=${JSON.stringify(embeddedBase.href)}>`);
}

async function loadBoardFrame(cdp) {
  const html = await boardDocument();
  const appSource = await readFile(path.join(root, "public", "app.js"), "utf8");
  const boardRoot = ensureLocalBoardUrl(process.env.LOCTEK_SPECBOARD_URL || "http://127.0.0.1:47932/");
  const registry = await fetchJson(`${boardRoot}/api/projects`);
  // Fetch through the local Node sidecar instead of from the iframe's opaque
  // about:blank origin. Electron can intermittently reject that fetch even
  // though static loopback assets load. The UI still receives only data from
  // the same loopback service and remains source-file driven.
  const portfolio = await fetchJson(`${boardRoot}/api/scan`, frameLoadTimeoutMs);
  const expectedProjects = registry.projects?.length || 0;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const frameName = await cdp.send("Runtime.evaluate", {
      expression: "document.getElementById('loctek-specboard-frame')?.name || null",
      returnByValue: true,
    });
    const targetFrame = frameName.result.value ? findFrameByName(frameTree, frameName.result.value) : null;
    if (targetFrame) {
      await cdp.send("Page.setDocumentContent", { frameId: targetFrame.id, html });
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const frame = document.getElementById("loctek-specboard-frame");
          if (!frame?.contentWindow) throw new Error("Specboard iframe unavailable");
          frame.contentWindow.__LOCTEK_SPECBOARD_MANAGED_LOAD__ = true;
          frame.contentWindow.__LOCTEK_SPECBOARD_BOOTSTRAP__ = ${JSON.stringify(portfolio)};
          const script = frame.contentDocument.createElement("script");
          script.textContent = ${JSON.stringify(appSource)};
          frame.contentDocument.body.append(script);
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      const initialized = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const frame = document.getElementById("loctek-specboard-frame");
          if (!frame?.contentWindow) throw new Error("Specboard iframe unavailable");
          return frame.contentWindow.eval(\`window.__loctekSpecboardLoad().then(() => ({
            projects: document.querySelectorAll("#project-select option").length - 1,
            title: document.querySelector(".completion-copy h1")?.textContent || "",
            warning: document.querySelector(".project-warning")?.textContent || "",
            error: document.querySelector(".error")?.textContent || ""
          }))\`);
        })()`,
        awaitPromise: true,
        returnByValue: true,
      }, frameLoadTimeoutMs);
      if (initialized.exceptionDetails) throw new Error(initialized.exceptionDetails.exception?.description || "Specboard 前端未能完成数据加载。");
      const snapshot = initialized.result.value;
      if (!snapshot || snapshot.projects !== expectedProjects) {
        throw new Error(`Specboard 项目组合未完成刷新：预期 ${expectedProjects} 个项目，实际 ${snapshot?.projects || 0} 个。`);
      }
      if (snapshot.error) throw new Error(`Specboard 页面显示错误：${snapshot.error}`);
      await cdp.send("Runtime.evaluate", {
        expression: "window.__loctekSpecboardInjection__?.markFrameLoaded?.()",
        returnByValue: true,
      });
      return snapshot;
    }
    await delay(50);
  }
  throw new Error("等待 Specboard iframe 挂载超时。");
}

async function refreshBoardFrame(target) {
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const state = await cdp.send("Runtime.evaluate", {
      expression: "({ visible: document.getElementById('loctek-specboard-page')?.hidden === false, loaded: document.getElementById('loctek-specboard-frame')?.dataset.loctekSpecboardLoaded === 'true' })",
      returnByValue: true,
    });
    if (!state.result.value?.visible) return false;
    await cdp.send("Runtime.evaluate", {
      expression: "window.__loctekSpecboardInjection__?.reloadFrame?.()",
      returnByValue: true,
    });
    await loadBoardFrame(cdp);
    return true;
  } finally {
    cdp.close();
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run(options) {
  if (options.launch) await launchCodex(options);
  if (!(await cdpReachable(options.port))) throw new Error(`专用 Codex 窗口未运行：127.0.0.1:${options.port}`);
  const { source, sourceHash } = await injectionSource();
  const injected = new Set();
  const synced = new Set();
  let firstOpen = options.open;

  do {
    try {
      const currentTargets = await targets(options.port);
      for (const target of currentTargets) {
        if (!synced.has(target.id)) {
          const count = await syncCodexProjects(target);
          if (count > 0) process.stdout.write(`已同步 ${count} 个 Codex 本机项目到 Specboard 注册表。\n`);
          synced.add(target.id);
          if (count > 0) await refreshBoardFrame(target);
        }
        const state = await targetState(target);
        const needsInjection = state.sourceHash !== sourceHash;
        const needsFrame = state.visible && !state.loaded;
        if (!needsInjection && !firstOpen && !needsFrame) continue;
        const wasKnown = injected.has(target.id);
        const status = await injectTarget(target, source, sourceHash, firstOpen, needsInjection);
        injected.add(target.id);
        if (firstOpen || !wasKnown || needsInjection) {
          process.stdout.write(`Specboard 侧栏已挂载：${target.title || target.id}（入口：${status.entryMounted ? "就绪" : "等待 Codex 页面加载"}）\n`);
        }
        firstOpen = false;
      }
    } catch (error) {
      if (!options.watch) throw error;
      process.stderr.write(`等待专用 Codex 窗口：${error.message}\n`);
    }
    if (options.watch) await delay(1_500);
  } while (options.watch);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  await run(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { ensureLocalBoardUrl, parseArgs };
