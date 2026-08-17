import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const CHANGE_CARD_DIRECTORIES = new Map([
  ["issues", "issue"],
  ["discussions", "discussion"],
  ["plans", "plan"],
  ["adr", "decision"],
  ["session-notes", "decision"],
]);

const EVIDENCE_DIRECTORIES = new Map([
  ["work-reports", "work-report"],
  ["test-reports", "test-report"],
  ["intents", "intent"],
  ["merge-reports", "merge-report"],
  ["pr", "pull-request"],
  ["releases", "release"],
]);

const ACTIVE_STATUSES = new Set(["draft", "backlog", "todo", "active", "proposed", "in_progress", "in_review", "blocked"]);
const DONE_STATUSES = new Set(["done", "completed", "archived", "closed", "accepted"]);
const PROJECT_SCAN_TIMEOUT_MS = 8_000;
const scannerWorkerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "scan-worker.mjs");

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function walkMarkdown(directory) {
  if (!(await exists(directory))) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkMarkdown(target);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".md") ? [target] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: content };
  const metadata = {};
  let pendingListKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && pendingListKey) {
      metadata[pendingListKey] ??= [];
      metadata[pendingListKey].push(unquote(listItem[1].trim()));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!pair) continue;
    const [, key, rawValue = ""] = pair;
    pendingListKey = key;
    if (!rawValue.trim()) {
      metadata[key] = [];
      continue;
    }
    metadata[key] = rawValue.includes(",")
      ? rawValue.split(",").map((item) => unquote(item.trim())).filter(Boolean)
      : unquote(rawValue.trim());
  }
  return { metadata, body: content.slice(match[0].length) };
}

function unquote(value) {
  return value.replace(/^(?:"|')|(?:"|')$/g, "");
}

export function firstHeading(markdown, fallback) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

export function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (index < 0) return "";
  const output = [];
  for (const line of lines.slice(index + 1)) {
    if (/^##\s+/.test(line)) break;
    output.push(line);
  }
  return output.join("\n").trim();
}

export function compactText(value, length = 260) {
  const compact = value
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > length ? `${compact.slice(0, length - 1)}…` : compact;
}

export function checkboxProgress(markdown, headings = []) {
  const scope = headings
    .map((heading) => section(markdown, heading))
    .find((candidate) => /- \[[ xX~]\]/.test(candidate)) || markdown;
  const boxes = [...scope.matchAll(/^\s*-\s+\[([ xX~])\]\s+(.+)$/gm)];
  if (boxes.length === 0) return { total: 0, completed: 0, partial: 0, ratio: null };
  const completed = boxes.filter((item) => /[xX]/.test(item[1])).length;
  const partial = boxes.filter((item) => item[1] === "~").length;
  return { total: boxes.length, completed, partial, ratio: completed / boxes.length };
}

function markdownListItems(markdown, source) {
  if (!markdown) return [];
  return [...markdown.matchAll(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[([ xX~])\]\s+)?(.+?)\s*$/gm)]
    .map((match) => ({
      text: compactText(match[2], 420),
      state: /[xX]/.test(match[1] || "") ? "completed" : match[1] === "~" ? "partial" : "open",
      source,
    }))
    .filter((item) => item.text);
}

function meaningfulItems(items) {
  return items.filter((item) => !/^(?:无|暂无|尚未记录|待补充|—|-)\s*[。.]?$/u.test(item.text));
}

function firstAvailableSection(markdown, headings) {
  return headings.map((heading) => ({ heading, value: section(markdown, heading) })).find((candidate) => candidate.value.trim()) || { heading: headings[0], value: "" };
}

function issueDetailFromBody(body) {
  const build = firstAvailableSection(body, ["要构建什么", "排查计划", "实施步骤", "计划"]);
  const goal = firstAvailableSection(body, ["目标", "期望行为", "修复边界"]);
  const acceptance = markdownListItems(section(body, "验收标准"), "验收标准");
  const blockerSection = section(body, "被阻塞");
  const listedBlockers = meaningfulItems(markdownListItems(blockerSection, "被阻塞"));
  const blockers = listedBlockers.length || !blockerSection.trim()
    ? listedBlockers
    : [{ text: compactText(blockerSection, 420), state: "open", source: "被阻塞" }];
  const scope = markdownListItems(build.value, build.heading);
  const fallbackScope = scope.length || !build.value
    ? scope
    : [{ text: compactText(build.value, 420), state: "open", source: build.heading }];
  const fallbackGoal = fallbackScope.length || !goal.value
    ? fallbackScope
    : [{ text: compactText(goal.value, 420), state: "open", source: goal.heading }];

  return {
    scope: fallbackGoal,
    acceptance,
    todo: acceptance.filter((item) => item.state !== "completed"),
    completed: acceptance.filter((item) => item.state === "completed"),
    blockers,
    blockerStatusNote: blockerSection.trim() && blockers.length === 0 ? compactText(blockerSection, 420) : null,
  };
}

function archiveAssessment(card, evidence) {
  const detail = card.detail;
  const testEvidence = evidence.filter((item) => item.type === "test-report");
  const executionEvidence = evidence.filter((item) => ["work-report", "merge-report", "pull-request"].includes(item.type));
  const checks = [];

  if (!DONE_STATUSES.has(card.status)) {
    checks.push({ level: "blocking", text: `任务状态为「${card.status}」，尚未进入可归档终态。` });
  }
  if (detail.acceptance.length > 0 && detail.todo.length > 0) {
    checks.push({ level: "blocking", text: `仍有 ${detail.todo.length}/${detail.acceptance.length} 项验收标准未完成。` });
  }
  if (card.status === "blocked" && detail.blockers.length === 0) {
    checks.push({ level: "blocking", text: "状态标记为 blocked，但源 issue 未记录具体阻塞原因。" });
  }
  if (detail.blockers.length > 0) {
    checks.push({ level: "blocking", text: `存在待解除的阻塞：${detail.blockers[0].text}` });
  }
  if (testEvidence.length === 0) {
    checks.push({ level: "evidence", text: "尚未找到关联测试/验证记录；这表示证据缺失，不等同于测试失败。" });
  }
  if (executionEvidence.length === 0) {
    checks.push({ level: "evidence", text: "尚未找到执行或合并记录；归档前建议补充可追溯的工作证据。" });
  }

  const recommendations = [];
  if (detail.blockers.length > 0) recommendations.push(`先确认并解除阻塞：${detail.blockers[0].text}`);
  else if (card.status === "blocked") recommendations.push("先在 issue 的「被阻塞」中补充具体原因和责任边界。");
  if (detail.todo.length > 0) recommendations.push(`优先推进下一项验收：${detail.todo[0].text}`);
  if (testEvidence.length === 0) recommendations.push("按测试计划执行验证，并写入关联的 test report。" );
  if (executionEvidence.length === 0) recommendations.push("补充 work report 或 merge report，记录已做工作与保留约束。");
  if (DONE_STATUSES.has(card.status) && detail.todo.length === 0 && testEvidence.length > 0) {
    recommendations.push(`确认完成后执行 Loctek 归档 dry-run：node tools/loctek/archive.mjs . --issue ${card.id} --dry-run`);
  }
  if (recommendations.length === 0) recommendations.push("记录已具备基础闭环；归档前仍请执行 Loctek dry-run，以脚本结果为准。");

  return {
    evidence: evidence.map((item) => ({ id: item.id, type: item.type, title: item.title, sourcePath: item.sourcePath, status: item.status })),
    workDone: executionEvidence.map((item) => ({ title: item.title, type: item.type, sourcePath: item.sourcePath, excerpt: item.excerpt })),
    archiveChecks: checks,
    recommendations,
    archiveReady: checks.length === 0,
  };
}

export function extractReferences(markdown) {
  return [...new Set((markdown.match(/\b(?:ISSUE|ADR|DISC|PLAN)-[A-Za-z0-9_.-]+\b/g) || []).map((value) => value.toUpperCase()))];
}

async function git(projectPath, args) {
  try {
    return await execFile("git", args, { cwd: projectPath, maxBuffer: 1024 * 1024 });
  } catch {
    return null;
  }
}

async function gitAuthorshipIndex(projectPath) {
  const history = await git(projectPath, ["log", "--format=%an%x1f%ae%x1f%aI", "--name-only", "--", ".changes", "openspec"]);
  const index = new Map();
  let author = null;
  for (const line of history?.stdout?.split("\n") || []) {
    if (!line.trim()) continue;
    if (line.includes("\x1f")) {
      const [name, email, at] = line.split("\x1f");
      author = { name, email, at };
      continue;
    }
    if (!author || !line.endsWith(".md")) continue;
    const entry = index.get(line) || { createdBy: null, updatedBy: null, hasLocalChanges: false };
    if (!entry.updatedBy) entry.updatedBy = author;
    entry.createdBy = author;
    index.set(line, entry);
  }
  const local = await git(projectPath, ["status", "--porcelain", "--", ".changes", "openspec"]);
  for (const line of local?.stdout?.split("\n") || []) {
    const relativePath = line.slice(3).trim();
    if (!relativePath) continue;
    const entry = index.get(relativePath) || { createdBy: null, updatedBy: null, hasLocalChanges: false };
    entry.hasLocalChanges = true;
    index.set(relativePath, entry);
  }
  return index;
}

function deriveStatus(metadata, type, body) {
  if (typeof metadata.status === "string" && metadata.status.trim()) return metadata.status.trim().toLowerCase();
  if (type === "openspec-change") return "proposed";
  if (type === "decision") return /已采纳|决定|决策/.test(body) ? "accepted" : "recorded";
  return "active";
}

function cardExcerpt(type, body) {
  const preferred = type === "issue"
    ? ["背景", "目标", "现象"]
    : type === "discussion" || type === "plan"
      ? ["结论", "背景", "方案与步骤"]
      : type === "decision"
        ? ["决策", "用户决策", "决策背景", "背景"]
        : ["背景", "目标", "Why"];
  return compactText(preferred.map((heading) => section(body, heading)).find(Boolean) || body);
}

function relatedIssueIds(markdown) {
  return extractReferences(markdown).filter((reference) => reference.startsWith("ISSUE-"));
}

function normaliseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

async function cardFromFile(projectPath, absolutePath, type, authorshipIndex) {
  const sourcePath = path.relative(projectPath, absolutePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const { metadata, body } = parseFrontmatter(raw);
  const title = firstHeading(body, path.basename(absolutePath, ".md"));
  const progress = checkboxProgress(body, type === "issue" ? ["验收标准"] : type === "plan" ? ["方案与步骤", "计划"] : []);
  const sourceId = typeof metadata.id === "string"
    ? metadata.id.toUpperCase()
    : type === "decision" && /\/adr\//.test(sourcePath)
      ? path.basename(absolutePath, ".md").toUpperCase()
      : `${type}:${sourcePath}`;
  const links = [...new Set([...normaliseArray(metadata.links).map((value) => String(value).toUpperCase()), ...extractReferences(raw)])]
    .filter((link) => link !== sourceId);
  return {
    id: sourceId,
    type,
    title,
    status: deriveStatus(metadata, type, body),
    risk: typeof metadata.risk === "string" ? metadata.risk : null,
    sliceType: typeof metadata.slice_type === "string" ? metadata.slice_type : null,
    issueKind: typeof metadata.issue_kind === "string" ? metadata.issue_kind : null,
    excerpt: cardExcerpt(type, body),
    progress,
    detail: type === "issue" ? issueDetailFromBody(body) : null,
    links,
    sourcePath,
    sourceBody: body,
    authorship: authorshipIndex.get(sourcePath) || { createdBy: null, updatedBy: null, hasLocalChanges: false },
  };
}

async function evidenceFromFile(projectPath, absolutePath, type, authorshipIndex) {
  const sourcePath = path.relative(projectPath, absolutePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const { metadata, body } = parseFrontmatter(raw);
  const issue = typeof metadata.issue === "string" ? metadata.issue.toUpperCase() : null;
  return {
    id: `${type}:${sourcePath}`,
    type,
    title: firstHeading(body, path.basename(absolutePath, ".md")),
    status: typeof metadata.status === "string" ? metadata.status.toLowerCase() : null,
    excerpt: compactText(body),
    links: [...new Set([...(issue ? [issue] : []), ...extractReferences(raw)])],
    sourcePath,
    authorship: authorshipIndex.get(sourcePath) || { createdBy: null, updatedBy: null, hasLocalChanges: false },
  };
}

async function scanOpenSpec(projectPath, authorshipIndex) {
  const changesDirectory = path.join(projectPath, "openspec", "changes");
  if (!(await exists(changesDirectory))) return [];
  const entries = await fs.readdir(changesDirectory, { withFileTypes: true });
  const cards = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const changePath = path.join(changesDirectory, entry.name);
    const proposal = path.join(changePath, "proposal.md");
    const tasks = path.join(changePath, "tasks.md");
    const design = path.join(changePath, "design.md");
    const content = (await exists(proposal))
      ? await fs.readFile(proposal, "utf8")
      : (await exists(design))
        ? await fs.readFile(design, "utf8")
        : `# ${entry.name}`;
    const taskBody = (await exists(tasks)) ? await fs.readFile(tasks, "utf8") : content;
    const sourcePath = path.relative(projectPath, (await exists(proposal)) ? proposal : changePath);
    cards.push({
      id: `OPENSPEC-${entry.name.toUpperCase()}`,
      type: "openspec-change",
      title: firstHeading(content, entry.name),
      status: "proposed",
      risk: null,
      sliceType: null,
      issueKind: null,
      excerpt: cardExcerpt("openspec-change", content),
      progress: checkboxProgress(taskBody),
      links: extractReferences(`${content}\n${taskBody}`),
      sourcePath,
      sourceBody: content,
      authorship: authorshipIndex.get(sourcePath) || { createdBy: null, updatedBy: null, hasLocalChanges: false },
      files: (await Promise.all([proposal, design, tasks].map(async (candidate) => (await exists(candidate)) ? path.relative(projectPath, candidate) : null))).filter(Boolean),
    });
  }
  return cards;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export async function scanProject(projectPath) {
  const resolvedProjectPath = path.resolve(projectPath);
  if (!(await exists(resolvedProjectPath))) throw new Error(`项目路径不存在：${resolvedProjectPath}`);
  const cards = [];
  const evidence = [];
  const authorshipIndex = await gitAuthorshipIndex(resolvedProjectPath);
  for (const [directory, type] of CHANGE_CARD_DIRECTORIES) {
    for (const markdownFile of await walkMarkdown(path.join(resolvedProjectPath, ".changes", directory))) {
      if (path.basename(markdownFile).startsWith("_")) continue;
      cards.push(await cardFromFile(resolvedProjectPath, markdownFile, type, authorshipIndex));
    }
  }
  for (const [directory, type] of EVIDENCE_DIRECTORIES) {
    for (const markdownFile of await walkMarkdown(path.join(resolvedProjectPath, ".changes", directory))) {
      if (path.basename(markdownFile).startsWith("_")) continue;
      evidence.push(await evidenceFromFile(resolvedProjectPath, markdownFile, type, authorshipIndex));
    }
  }
  cards.push(...await scanOpenSpec(resolvedProjectPath, authorshipIndex));
  cards.sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  const evidenceByLink = {};
  for (const item of evidence) {
    for (const linkedId of item.links) {
      evidenceByLink[linkedId] ??= [];
      evidenceByLink[linkedId].push(item.id);
    }
  }
  for (const card of cards) {
    card.evidenceIds = evidenceByLink[card.id] || [];
    if (card.type === "issue") {
      const linkedEvidence = card.evidenceIds.map((id) => evidence.find((item) => item.id === id)).filter(Boolean);
      card.detail = { ...card.detail, ...archiveAssessment(card, linkedEvidence) };
    }
  }
  const activeIssues = cards.filter((card) => card.type === "issue" && ACTIVE_STATUSES.has(card.status));
  const doneIssues = cards.filter((card) => card.type === "issue" && DONE_STATUSES.has(card.status));
  const blockedIssues = activeIssues.filter((card) => card.status === "blocked" || card.detail?.blockers?.length > 0);
  const archiveGaps = activeIssues.filter((card) => card.detail?.archiveChecks?.some((check) => check.level === "evidence"));
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    project: {
      path: resolvedProjectPath,
      name: path.basename(resolvedProjectPath),
      readme: await readProjectSummary(resolvedProjectPath),
    },
    cards,
    evidence,
    summary: {
      cards: cards.length,
      evidence: evidence.length,
      activeIssues: activeIssues.length,
      doneIssues: doneIssues.length,
      blockedIssues: blockedIssues.length,
      archiveGaps: archiveGaps.length,
      byType: countBy(cards, (card) => card.type),
      byStatus: countBy(cards, (card) => card.status),
      byRisk: countBy(cards.filter((card) => card.risk), (card) => card.risk),
    },
  };
}

export async function scanProjects(projects) {
  const normalizedProjects = uniqueProjects(projects);
  const results = await Promise.all(normalizedProjects.map(async (project) => {
    try {
      const scan = await scanProjectInWorker(project.path, project.label || project.path);
      return { ...scan, project: { ...scan.project, id: project.id, label: project.label || scan.project.readme.title }, registry: project };
    } catch (error) {
      return {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        project: { id: project.id, path: project.path, name: path.basename(project.path), label: project.label || path.basename(project.path), readme: { title: project.label || path.basename(project.path), summary: "" } },
        cards: [],
        evidence: [],
        summary: { cards: 0, evidence: 0, activeIssues: 0, doneIssues: 0, blockedIssues: 0, archiveGaps: 0, byType: {}, byStatus: {}, byRisk: {} },
        error: error.message,
        registry: project,
      };
    }
  }));
  const available = results.filter((scan) => !scan.error);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    projects: results.map((scan) => ({
      id: scan.project.id,
      label: scan.project.label,
      name: scan.project.name,
      path: scan.project.path,
      summary: scan.summary,
      error: scan.error || null,
    })),
    summary: {
      projects: results.length,
      availableProjects: available.length,
      unavailableProjects: results.length - available.length,
      cards: available.reduce((total, scan) => total + scan.summary.cards, 0),
      evidence: available.reduce((total, scan) => total + scan.summary.evidence, 0),
      activeIssues: available.reduce((total, scan) => total + scan.summary.activeIssues, 0),
      blockedIssues: available.reduce((total, scan) => total + scan.summary.blockedIssues, 0),
      archiveGaps: available.reduce((total, scan) => total + scan.summary.archiveGaps, 0),
    },
    scans: results,
  };
}

async function scanProjectInWorker(projectPath, label) {
  try {
    const { stdout } = await execFile(process.execPath, [scannerWorkerPath, projectPath], {
      timeout: PROJECT_SCAN_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === "ETIMEDOUT" || error.killed || error.signal === "SIGKILL") {
      throw new Error(`扫描超时（${Math.round(PROJECT_SCAN_TIMEOUT_MS / 1000)} 秒）：${label} 可能不可访问、权限受限或文件系统响应过慢。`);
    }
    throw new Error(error.stderr?.trim() || error.message);
  }
}

function uniqueProjects(projects = []) {
  const byPath = new Map();
  for (const project of projects) {
    if (!project?.path) continue;
    const resolvedPath = path.resolve(project.path);
    if (byPath.has(resolvedPath)) continue;
    const id = String(project.id || slugify(path.basename(resolvedPath)));
    byPath.set(resolvedPath, { id, path: resolvedPath, label: typeof project.label === "string" ? project.label.trim() : "" });
  }
  return [...byPath.values()];
}

async function readProjectSummary(projectPath) {
  const readme = path.join(projectPath, "README.md");
  if (!(await exists(readme))) return { title: path.basename(projectPath), summary: "" };
  const content = await fs.readFile(readme, "utf8");
  const title = firstHeading(content, path.basename(projectPath));
  const afterTitle = content.slice(content.search(/^#\s+/m)).replace(/^#\s+.*(?:\r?\n|$)/, "");
  const intro = afterTitle.split(/^##\s+/m)[0];
  return { title, summary: compactText(intro, 500) };
}

function relativeSourceLink(sourcePath) {
  return `\`${sourcePath}\``;
}

function bulletLinks(items) {
  return items.map((item) => `- ${item.id}: ${item.title}（${relativeSourceLink(item.sourcePath)}）`).join("\n") || "- 暂无可用记录。";
}

export function generateNarrative(scan) {
  const issues = scan.cards.filter((card) => card.type === "issue");
  const decisions = scan.cards.filter((card) => card.type === "decision");
  const discussions = scan.cards.filter((card) => card.type === "discussion");
  const plans = scan.cards.filter((card) => card.type === "plan");
  const openSpecChanges = scan.cards.filter((card) => card.type === "openspec-change");
  const active = issues.filter((card) => ACTIVE_STATUSES.has(card.status));
  const completed = issues.filter((card) => DONE_STATUSES.has(card.status) || card.progress.ratio === 1);
  const uncertain = issues.filter((card) => card.status === "blocked" || card.progress.partial > 0 || card.progress.ratio === null);
  const evidenceById = new Map(scan.evidence.map((item) => [item.id, item]));
  const issueCases = issues.filter((issue) => issue.evidenceIds.length > 0 || issue.progress.total > 0).slice(0, 24);

  const lines = [
    `# ${scan.project.readme.title}：项目故事与技术复盘`,
    "",
    `> 生成时间：${scan.generatedAt}。本报告由 Loctek Specboard 从项目中的 Markdown 与 Git 元数据汇总；每一项均保留源文件路径。没有证据的事项会标记为待补证，而不会推断为已完成。`,
    "",
    "## 给非技术读者的摘要",
    "",
    "### 这个项目在解决什么",
    "",
    scan.project.readme.summary || "项目 README 未提供可提取的概述，建议补充项目目标。",
    "",
    "### 当前全貌",
    "",
    `- 共发现 ${scan.summary.cards} 张知识/任务卡和 ${scan.summary.evidence} 份执行证据。`,
    `- 可执行 issue：${issues.length} 个；其中当前活跃 ${active.length} 个，具备完成证据或全部验收项勾选 ${completed.length} 个。`,
    `- 已沉淀讨论 ${discussions.length} 条、计划 ${plans.length} 条、架构/会话决策 ${decisions.length} 条、OpenSpec 变更 ${openSpecChanges.length} 条。`,
    "",
    "### 近期重点与需要关注的事项",
    "",
    ...active.slice(0, 12).map((item) => `- **${item.id}｜${item.title}**：${item.excerpt}（状态：${item.status}）`),
    active.length === 0 ? "- 当前未发现活跃 issue。" : "",
    "",
    "## 从目标到实施的脉络",
    "",
    "### 已确认的方案与计划",
    "",
    bulletLinks([...discussions, ...plans].slice(0, 20)),
    "",
    "### 架构与关键取舍",
    "",
    ...decisions.slice(0, 20).map((item) => `#### ${item.id}｜${item.title}\n\n${item.excerpt}\n\n来源：${relativeSourceLink(item.sourcePath)}\n`),
    decisions.length === 0 ? "尚未发现 ADR 或 session note；建议把已确认的架构取舍沉淀为 ADR 或讨论卡。" : "",
    "",
    "## 技术复盘：问题、处理方式与验证证据",
    "",
  ];

  for (const issue of issueCases) {
    const linkedEvidence = issue.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean);
    const progress = issue.progress.total === 0
      ? "未定义可计算的验收 checklist"
      : `${issue.progress.completed}/${issue.progress.total} 项验收已勾选${issue.progress.partial ? `，${issue.progress.partial} 项部分完成` : ""}`;
    lines.push(
      `### ${issue.id}｜${issue.title}`,
      "",
      "**问题/目标**",
      "",
      issue.excerpt || "待从源记录补充。",
      "",
      "**处理方式与关键约束**",
      "",
      compactText(section(issue.sourceBody, "要构建什么") || section(issue.sourceBody, "排查计划") || section(issue.sourceBody, "必须保留的行为") || "源 issue 未提供独立实现说明。", 900),
      "",
      "**进度与验证**",
      "",
      `- ${progress}；任务状态：${issue.status}。`,
      `- 关联证据：${linkedEvidence.length ? linkedEvidence.map((item) => `${item.type} ${relativeSourceLink(item.sourcePath)}`).join("；") : "尚未找到 work/test/merge 等关联证据，待补证。"}`,
      `- 源任务：${relativeSourceLink(issue.sourcePath)}。`,
      "",
    );
  }

  lines.push(
    "## 风险、未决问题与下一步",
    "",
    ...uncertain.slice(0, 20).map((item) => `- **${item.id}｜${item.title}**：${item.status === "blocked" ? "被阻塞" : "进度或验证尚不完整"}；${item.excerpt}（${relativeSourceLink(item.sourcePath)}）`),
    uncertain.length === 0 ? "- 未发现显式阻塞或部分完成标记；仍建议在发布前核验外部环境与未提交改动。" : "",
    "",
    "## 来源索引（供复盘与审计）",
    "",
    "| 类型 | 数量 | 代表来源 |",
    "| --- | ---: | --- |",
    ...Object.entries(scan.summary.byType).sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => {
      const source = scan.cards.find((item) => item.type === type)?.sourcePath || "—";
      return `| ${type} | ${count} | ${relativeSourceLink(source)} |`;
    }),
    "",
    "---",
    "",
    "本报告是可重复生成的索引，不替代原始 `.changes/`、`openspec/` 或 Git 历史。编辑源记录后重新生成即可更新。",
  );
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "" && all[index + 1] === "")).join("\n");
}

function slugify(title) {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return slug || "record";
}

async function configuredAuthor(projectPath) {
  const name = await git(projectPath, ["config", "user.name"]);
  const email = await git(projectPath, ["config", "user.email"]);
  return [name?.stdout?.trim(), email?.stdout?.trim()].filter(Boolean).join(" <>") || "未配置 Git 作者";
}

export async function captureRecord(projectPath, options) {
  const kind = options.kind === "plan" ? "plan" : "discussion";
  if (!options.title?.trim()) throw new Error("缺少 --title，无法创建可检索记录。");
  if (!options.summary?.trim()) throw new Error("缺少 --summary，请记录讨论背景或问题，而不是保存完整对话。\n");
  const resolvedProjectPath = path.resolve(projectPath);
  const date = new Date().toISOString().slice(0, 10);
  const compactDate = date.replaceAll("-", "");
  const targetDirectory = path.join(resolvedProjectPath, ".changes", kind === "plan" ? "plans" : "discussions");
  await fs.mkdir(targetDirectory, { recursive: true });
  const prefix = kind === "plan" ? "PLAN" : "DISC";
  const existing = await fs.readdir(targetDirectory);
  const sequence = String(existing.filter((file) => file.startsWith(`${kind}-${date}`)).length + 1).padStart(3, "0");
  const id = `${prefix}-${compactDate}-${sequence}`;
  const filename = `${kind}-${date}-${slugify(options.title)}.md`;
  const destination = path.join(targetDirectory, filename);
  if (await exists(destination)) throw new Error(`记录已存在：${destination}`);
  const links = (options.links || []).map((item) => item.trim()).filter(Boolean);
  const steps = (options.steps || []).map((item) => item.trim()).filter(Boolean);
  const author = await configuredAuthor(resolvedProjectPath);
  const content = [
    "---",
    `type: ${kind}`,
    `id: ${id}`,
    "status: active",
    `created_by: ${JSON.stringify(author)}`,
    ...(links.length ? ["links:", ...links.map((link) => `  - ${link}`)] : []),
    "---",
    "",
    `# ${options.title.trim()}`,
    "",
    "## 背景",
    "",
    options.summary.trim(),
    "",
    "## 结论",
    "",
    options.decision?.trim() || "待讨论确认。",
    "",
    "## 方案与步骤",
    "",
    ...(steps.length ? steps.map((step) => `- [ ] ${step}`) : ["- [ ] 将结论拆成可验证的后续行动。"]),
    "",
    "## 放弃方案",
    "",
    options.alternatives?.trim() || "尚未记录。",
    "",
    "## 未决问题",
    "",
    options.openQuestions?.trim() || "无。",
    "",
    "## 关联记录",
    "",
    ...(links.length ? links.map((link) => `- ${link}`) : ["- 暂无。"]),
    "",
  ].join("\n");
  await fs.writeFile(destination, content, "utf8");
  return { id, kind, path: path.relative(resolvedProjectPath, destination) };
}
