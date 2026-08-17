#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateNarrative, scanProjects } from "./lib.mjs";
import { addRegistryProject, readProjectRegistry, removeRegistryProject, writeProjectRegistry } from "./registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || 47931);
const registryPath = path.resolve(args.registry || path.join(root, "projects.json"));
const fallbackProject = args.project ? { id: "default", path: path.resolve(args.project), label: "" } : null;
let cached = null;
let scanPromise = null;

async function registry() {
  const configured = await readProjectRegistry(registryPath);
  return fallbackProject && !configured.projects.some((project) => project.path === fallbackProject.path)
    ? { ...configured, projects: [...configured.projects, fallbackProject] }
    : configured;
}

async function scan() {
  if (scanPromise) return scanPromise;
  scanPromise = scanProjects((await registry()).projects)
    .then((result) => {
      cached = result;
      return result;
    })
    .finally(() => { scanPromise = null; });
  return scanPromise;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  try {
    if (request.method === "OPTIONS") return text(response, "", "text/plain; charset=utf-8", 204);
    if (request.method === "GET" && url.pathname === "/api/scan") return json(response, await scan());
    if (request.method === "GET" && url.pathname === "/api/projects") return json(response, await registry());
    if (request.method === "GET" && url.pathname === "/api/narrative") return narrative(response, url);
    if (request.method === "GET" && url.pathname === "/api/health") return json(response, { ok: true, registryPath, projects: (await registry()).projects.length, generatedAt: cached?.generatedAt || null });
    if (request.method === "POST" && url.pathname === "/api/projects") return addProject(request, response);
    if (request.method === "DELETE" && url.pathname.startsWith("/api/projects/")) return deleteProject(response, decodeURIComponent(url.pathname.slice("/api/projects/".length)));
    if (url.pathname === "/" || url.pathname === "/index.html") return asset(response, "index.html", "text/html; charset=utf-8");
    if (url.pathname === "/app.js") return asset(response, "app.js", "application/javascript; charset=utf-8");
    if (url.pathname === "/style.css") return asset(response, "style.css", "text/css; charset=utf-8");
    response.writeHead(404).end("Not found");
  } catch (error) {
    json(response, { error: error.message }, 500);
  }
});

async function narrative(response, url) {
  const result = (await scan()).scans.find((item) => item.project.id === url.searchParams.get("project")) || (await scan()).scans[0];
  if (!result || result.error) throw new Error("没有可生成项目故事的可用项目。");
  text(response, generateNarrative(result), "text/markdown; charset=utf-8");
}

async function addProject(request, response) {
  const project = await requestBody(request);
  const updated = await writeProjectRegistry(
    registryPath,
    addRegistryProject(await registry(), project, { preserveExistingLabel: project.preserveExistingLabel === true }),
  );
  cached = null;
  json(response, updated, 201);
}

async function deleteProject(response, id) {
  const updated = await writeProjectRegistry(registryPath, removeRegistryProject(await registry(), id));
  cached = null;
  json(response, updated);
}

function parseArgs(values) {
  return Object.fromEntries(values.flatMap((token, index) => token.startsWith("--") && values[index + 1] ? [[token.slice(2), values[index + 1]]] : []));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体必须是 JSON。");
  }
}

async function asset(response, filename, contentType) {
  text(response, await readFile(path.join(root, "public", filename)), contentType);
}

function json(response, value, status = 200) {
  text(response, JSON.stringify(value), "application/json; charset=utf-8", status);
}

function text(response, value, contentType, status = 200) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    // The sidebar uses a CDP-created about:blank frame with opaque origin.
    // This still exposes only loopback data, but lets the embedded board fetch
    // its own local JSON and static assets instead of failing CORS.
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(value);
}

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Loctek Specboard: http://127.0.0.1:${port}\nRegistry: ${registryPath}\n`);
});
