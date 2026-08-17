import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { captureRecord, generateNarrative, scanProject, scanProjects, updateIssueRecord } from "../src/lib.mjs";
import { addRegistryProject, removeRegistryProject } from "../src/registry.mjs";
import { validateLoopbackWebSocketUrl } from "../scripts/codex-cdp.mjs";
import { ensureLocalBoardUrl, parseArgs } from "../scripts/codex-sidecar.mjs";

const execFile = promisify(execFileCallback);

async function fixtureProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "loctek-specboard-"));
  await write(root, "README.md", "# 演示项目\n\n这是给用户提供安全自动化的演示项目。\n\n## 架构\n\n不会成为介绍的一部分。\n");
  await write(root, ".changes/issues/issue-001-demo.md", `---
type: issue
id: ISSUE-001
issue_kind: feature
slice_type: AFK
risk: high
status: in_progress
created_by: "产品创建者"
assignee: "开发负责人"
reviewers:
  - "测试同学"
---

# 安全导出

## 背景

用户需要安全地导出数据。

## 要构建什么

加入带权限判断的导出入口。

## 验收标准

- [x] 未授权用户不能导出
- [ ] 已授权用户可以下载
`);
  await write(root, ".changes/work-reports/issue-001-2026-08-16.md", `---
type: work-report
issue: ISSUE-001
status: in_progress
---

# Work Report: 安全导出

## Implementation

已补充权限检查。
`);
  await write(root, ".changes/adr/ADR-001-export-boundary.md", "# ADR-001：导出边界\n\n## 决策\n\n权限检查必须在服务端执行。\n");
  await write(root, ".changes/session-notes/2026-08-16-export.md", "# Session Note: 导出取舍\n\n## 用户决策\n\n不提供绕过权限的本地导出。\n");
  await write(root, "openspec/changes/safe-export/proposal.md", "# 安全导出\n\n## Why\n\n统一导出边界。\n");
  await write(root, "openspec/changes/safe-export/tasks.md", "# Tasks\n\n- [x] 定义权限\n- [ ] 补充回归测试\n");
  await execFile("git", ["init"], { cwd: root });
  await execFile("git", ["config", "user.name", "Specboard Tester"], { cwd: root });
  await execFile("git", ["config", "user.email", "specboard@example.test"], { cwd: root });
  await execFile("git", ["add", "."], { cwd: root });
  await execFile("git", ["commit", "-m", "seed project memory"], { cwd: root });
  return root;
}

async function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

test("scans Loctek, OpenSpec and Git evidence into related cards", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  const scan = await scanProject(project);
  const issue = scan.cards.find((card) => card.id === "ISSUE-001");
  const change = scan.cards.find((card) => card.id === "OPENSPEC-SAFE-EXPORT");

  assert.equal(issue.type, "issue");
  assert.deepEqual(issue.progress, { total: 2, completed: 1, partial: 0, ratio: 0.5 });
  assert.equal(issue.authorship.createdBy.name, "Specboard Tester");
  assert.deepEqual(issue.collaboration, {
    createdBy: "产品创建者",
    assignee: "开发负责人",
    reviewers: ["测试同学"],
    activities: [],
  });
  assert.equal(issue.evidenceIds.length, 1);
  assert.equal(scan.evidence.find((item) => item.id === issue.evidenceIds[0]).type, "work-report");
  assert.deepEqual(issue.detail.todo.map((item) => item.text), ["已授权用户可以下载"]);
  assert.deepEqual(issue.detail.completed.map((item) => item.text), ["未授权用户不能导出"]);
  assert.match(issue.detail.archiveChecks.map((item) => item.text).join("\n"), /尚未找到关联测试\/验证记录/);
  assert.equal(issue.detail.recommendations[0], "优先推进下一项验收：已授权用户可以下载");
  assert.equal(change.type, "openspec-change");
  assert.equal(change.progress.ratio, 0.5);
});

test("falls back to the Git creator as the assignee for legacy issues", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  await write(project, ".changes/issues/issue-002-legacy.md", `---
type: issue
id: ISSUE-002
status: draft
---

# 旧任务

## 验收标准

- [ ] 补齐任务协议
`);
  await execFile("git", ["add", ".changes/issues/issue-002-legacy.md"], { cwd: project });
  await execFile("git", ["commit", "-m", "add legacy issue"], { cwd: project });
  const issue = (await scanProject(project)).cards.find((card) => card.id === "ISSUE-002");

  assert.equal(issue.collaboration.createdBy, "Specboard Tester");
  assert.equal(issue.collaboration.assignee, "Specboard Tester");
  assert.equal(issue.detail.lifecycle.skill, "loctek-issue");
});

test("writes assignee status and comments back to exactly one active issue", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  const update = await updateIssueRecord(project, "ISSUE-001", {
    assignee: "Alice",
    status: "blocked",
    comment: "需要先确认权限边界。",
  });
  const source = await readFile(path.join(project, ".changes/issues/issue-001-demo.md"), "utf8");
  const issue = (await scanProject(project)).cards.find((card) => card.id === "ISSUE-001");

  assert.equal(update.changed, true);
  assert.match(source, /assignee: Alice/);
  assert.match(source, /status: blocked/);
  assert.match(source, /协作动态/);
  assert.match(source, /负责人：开发负责人 → Alice/);
  assert.match(source, /需要先确认权限边界/);
  assert.equal(issue.collaboration.assignee, "Alice");
  assert.equal(issue.status, "blocked");
  assert.equal(issue.collaboration.activities.length, 3);
  assert.equal(issue.collaboration.activities[2].kind, "评论");
  assert.equal(issue.detail.lifecycle.skill, "loctek-work");
  await assert.rejects(() => updateIssueRecord(project, "ISSUE-404", { comment: "不存在" }), /未找到可编辑/);
  await assert.rejects(() => updateIssueRecord(project, "ISSUE-001", { status: "shipping" }), /允许的范围/);
});

test("backfills legacy ownership on a no-op collaboration save", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  await write(project, ".changes/issues/issue-009-legacy.md", `---
type: issue
id: ISSUE-009
status: draft
---

# 旧任务
`);
  const update = await updateIssueRecord(project, "ISSUE-009", { status: "draft" });
  const source = await readFile(path.join(project, ".changes/issues/issue-009-legacy.md"), "utf8");

  assert.equal(update.changed, true);
  assert.match(source, /created_by: "Specboard Tester"/);
  assert.match(source, /assignee: "Specboard Tester"/);
  assert.doesNotMatch(source, /协作动态/);
});

test("preserves an Issue byte-for-byte when an unchanged legacy field is saved", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  const issuePath = path.join(project, ".changes/issues/issue-001-demo.md");
  const before = await readFile(issuePath, "utf8");
  const update = await updateIssueRecord(project, "ISSUE-001", { assignee: "开发负责人", status: "in_progress" });

  assert.equal(update.changed, false);
  assert.equal(await readFile(issuePath, "utf8"), before);
});

test("recommends test then archive from actual status and evidence", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  await updateIssueRecord(project, "ISSUE-001", { status: "completed" });
  let issue = (await scanProject(project)).cards.find((card) => card.id === "ISSUE-001");
  assert.equal(issue.detail.lifecycle.skill, "loctek-test");

  await write(project, ".changes/test-reports/issue-001-2026-08-17.md", `---
type: test-report
issue: ISSUE-001
status: completed
---

# 测试报告

已验证导出权限。
`);
  await updateIssueRecord(project, "ISSUE-001", { comment: "准备归档。" });
  const issuePath = path.join(project, ".changes/issues/issue-001-demo.md");
  const source = await readFile(issuePath, "utf8");
  await write(project, ".changes/issues/issue-001-demo.md", source.replace("- [ ] 已授权用户可以下载", "- [x] 已授权用户可以下载"));
  issue = (await scanProject(project)).cards.find((card) => card.id === "ISSUE-001");
  assert.equal(issue.detail.lifecycle.skill, "loctek-archive");
});

test("captures a compact discussion that immediately joins the board", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  const record = await captureRecord(project, {
    kind: "discussion",
    title: "导出授权口径",
    summary: "需要确定权限校验放置位置。",
    decision: "在服务端校验。",
    alternatives: "不采用仅客户端校验。",
    links: ["ISSUE-001", "ADR-001"],
  });
  const source = await readFile(path.join(project, record.path), "utf8");
  const scan = await scanProject(project);
  const card = scan.cards.find((item) => item.id === record.id);

  assert.match(source, /不采用仅客户端校验/);
  assert.equal(card.type, "discussion");
  assert.deepEqual(card.links.sort(), ["ADR-001", "ISSUE-001"]);
});

test("derives blockers, archive checks and conservative next actions from an issue", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  await write(project, ".changes/issues/issue-002-blocked.md", `---
type: issue
id: ISSUE-002
status: blocked
---

# 受阻任务

## 要构建什么

- 连接受控服务。

## 验收标准

- [x] 完成接口定义
- [ ] 完成真实环境验证

## 被阻塞

等待平台团队提供隔离环境。
`);
  const issue = (await scanProject(project)).cards.find((card) => card.id === "ISSUE-002");

  assert.deepEqual(issue.detail.blockers.map((item) => item.text), ["等待平台团队提供隔离环境。"]);
  assert.match(issue.detail.archiveChecks.map((item) => item.text).join("\n"), /任务状态为「blocked」/);
  assert.match(issue.detail.archiveChecks.map((item) => item.text).join("\n"), /仍有 1\/2 项验收标准未完成/);
  assert.equal(issue.detail.recommendations[0], "先确认并解除阻塞：等待平台团队提供隔离环境。");
  assert.ok(!issue.detail.recommendations.some((item) => /归档 dry-run/.test(item)));
});

test("aggregates registered projects without blending their duplicate issue IDs", async (context) => {
  const first = await fixtureProject();
  const second = await fixtureProject();
  context.after(() => Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true })]));
  await write(second, "README.md", "# 第二项目\n\n第二个项目的说明。\n");
  const portfolio = await scanProjects([
    { id: "first", label: "第一项目", path: first },
    { id: "second", label: "第二项目", path: second },
  ]);

  assert.equal(portfolio.projects.length, 2);
  assert.equal(portfolio.summary.activeIssues, 2);
  assert.equal(portfolio.scans[0].project.id, "first");
  assert.equal(portfolio.scans[1].project.id, "second");
  assert.equal(portfolio.scans[0].cards.find((card) => card.id === "ISSUE-001").project, undefined);
});

test("keeps project identity on cards when rendering a single-project overview", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  const scan = await scanProject(project);
  const enriched = scan.cards.map((card) => ({ ...card, project: { id: "demo", label: "演示项目" } }));
  const issue = enriched.find((card) => card.id === "ISSUE-001");

  assert.equal(issue.project.id, "demo");
  assert.equal(`${issue.project.id}::${issue.id}`, "demo::ISSUE-001");
});

test("project registry replaces a matching path and removes by stable id", () => {
  const initial = { projects: [{ id: "cowork", label: "旧名称", path: "/tmp/cowork" }] };
  const replaced = addRegistryProject(initial, { label: "Cowork", path: "/tmp/cowork" });

  assert.deepEqual(replaced.projects, [{ id: "cowork", label: "Cowork", path: "/tmp/cowork" }]);
  assert.deepEqual(removeRegistryProject(replaced, "cowork").projects, []);
});

test("Codex project discovery keeps an existing display label", () => {
  const initial = { projects: [{ id: "cowork", label: "Loctek AI Cowork", path: "/tmp/cowork" }] };
  const synced = addRegistryProject(initial, { label: "loctek-ai-cowork", path: "/tmp/cowork" }, { preserveExistingLabel: true });

  assert.deepEqual(synced.projects, [{ id: "cowork", label: "Loctek AI Cowork", path: "/tmp/cowork" }]);
});

test("keeps the Codex sidecar limited to loopback endpoints", () => {
  assert.equal(ensureLocalBoardUrl("http://127.0.0.1:47932/anything"), "http://127.0.0.1:47932");
  assert.equal(validateLoopbackWebSocketUrl("ws://127.0.0.1:9232/devtools/page/demo", 9232), "ws://127.0.0.1:9232/devtools/page/demo");
  assert.equal(parseArgs(["--port", "9232", "--open"]).open, true);
  assert.throws(() => ensureLocalBoardUrl("https://example.com/specboard"), /本机/);
  assert.throws(() => validateLoopbackWebSocketUrl("ws://example.com:9232/devtools/page/demo", 9232), /本机/);
});

test("keeps an empty project available in the cross-project view", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loctek-specboard-discovery-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await write(root, "README.md", "# 空项目\n\n尚未采用 Loctek 或 OpenSpec。\n");
  const portfolio = await scanProjects([{ id: "empty", label: "空项目", path: root }]);

  assert.equal(portfolio.projects[0].label, "空项目");
  assert.equal(portfolio.scans[0].cards.length, 0);
  assert.equal(portfolio.scans[0].error, undefined);
});

test("contains an unreachable project without blocking the portfolio", async (context) => {
  const valid = await fixtureProject();
  context.after(() => rm(valid, { recursive: true, force: true }));
  const portfolio = await scanProjects([
    { id: "valid", label: "可用项目", path: valid },
    { id: "missing", label: "不可访问项目", path: path.join(valid, "missing") },
  ]);

  assert.equal(portfolio.summary.availableProjects, 1);
  assert.equal(portfolio.summary.unavailableProjects, 1);
  assert.equal(portfolio.scans.find((scan) => scan.project.id === "valid").cards.length > 0, true);
  assert.match(portfolio.scans.find((scan) => scan.project.id === "missing").error, /不存在/);
});

test("serves the embedded local board to the opaque CDP frame origin", async (context) => {
  const server = createServer((request, response) => {
    response.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    }).end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/scan`, { headers: { origin: "null" } });

  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("generates a layered story without claiming missing evidence is complete", async (context) => {
  const project = await fixtureProject();
  context.after(() => rm(project, { recursive: true, force: true }));
  const narrative = generateNarrative(await scanProject(project));

  assert.match(narrative, /给非技术读者的摘要/);
  assert.match(narrative, /技术复盘：问题、处理方式与验证证据/);
  assert.match(narrative, /ISSUE-001/);
  assert.match(narrative, /work-report `.changes\/work-reports\/issue-001-2026-08-16.md`/);
  assert.match(narrative, /待补证|进度与验证/);
});
