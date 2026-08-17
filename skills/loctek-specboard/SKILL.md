---
name: loctek-specboard
description: 管理 Loctek Specboard 的项目记忆。用户提到把 AI 讨论、方案、计划、关键决策沉淀为可检索记录，想从 .changes / OpenSpec 查看任务全貌、生成看板数据、生成可给非技术人员分享或给技术人员复盘的项目故事、梳理问题与解决过程时，必须使用本 skill。与 loctek-issue、loctek-work、loctek-test、loctek-commit 配合：Specboard 记录和呈现语义，不替代它们的 issue、work report、test report 或 intent 工作流。
---

# Loctek Specboard

Specboard 将 Loctek `.changes/`、可选的 `openspec/` 与 Git 记录组织成可追溯的项目记忆。
源 Markdown 和 Git 历史始终是事实源；Specboard 只扫描、生成索引和创建受控的讨论/计划记录，不建立第二套不透明的任务事实。

## 什么时候沉淀讨论

当用户或 AI 已达成以下任一类结论时，建议并在用户同意后立即沉淀：

- 方案方向、技术选型、架构边界或安全/权限取舍；
- 多步骤实施计划，且尚未或不适合直接拆为 issue；
- 已排除的方案、重要限制、风险或待人确认的问题；
- 需要日后从看板或项目故事中重新找到的讨论结果。

不要保存完整聊天记录、思考过程、secret、token、密码、个人隐私或未经确认的事实。保留“背景、结论、理由、放弃方案、未决问题、关联记录”即可。

## 项目路径与工具

插件根目录下的 CLI 是唯一确定性写入入口：

```bash
node "<plugin-root>/src/cli.mjs" scan --project <project-path>
node "<plugin-root>/src/cli.mjs" narrative --project <project-path> --output docs/project-story.md
node "<plugin-root>/src/cli.mjs" capture --project <project-path> --kind discussion|plan --title <title> --summary <summary>
```

如果插件根目录无法从当前上下文得知，先定位包含 `src/cli.mjs` 的 `loctek-specboard` 目录。不要复写 CLI 行为，也不要手工编造 ID。

## 工作流

### 1. 先扫描，再判断是否写入

先运行：

```bash
node "<plugin-root>/src/cli.mjs" scan --project <project-path>
```

检查已有 issue、discussion、plan、decision 和 OpenSpec change：

- 已有记录足以承载结论：更新该源记录的正确位置，或只返回链接建议；不要创建重复卡。
- 是实施任务：交给 `loctek-issue` 拆分或更新 `.changes/issues/`，不要用 discussion 替代 issue。
- 是执行中的实现/排查：交给 `loctek-work`，持续写 work report。
- 是结论或探索计划：使用本 skill 的 `capture`。

### 2. 保存讨论或计划

用 `discussion` 保存已经形成的共识；用 `plan` 保存可勾选、可拆 issue 的路线图。

```bash
node "<plugin-root>/src/cli.mjs" capture \
  --project <project-path> \
  --kind discussion \
  --title "<结论型标题>" \
  --summary "<为什么要讨论，当前问题是什么>" \
  --decision "<用户已确认的选择及理由>" \
  --alternatives "<排除的方案及原因>" \
  --open-questions "<未决问题；没有则写无>" \
  --links "ISSUE-001,ADR-001"
```

计划额外传入一个或多个 `--step`，每步必须可验证；随后在源文件中勾选，不要只在聊天里说完成：

```bash
node "<plugin-root>/src/cli.mjs" capture \
  --project <project-path> --kind plan --title "<计划标题>" \
  --summary "<计划背景>" --decision "<路线选择>" \
  --step "<可验证步骤 1>" --step "<可验证步骤 2>"
```

创建后返回 ID、路径、关联 issue，并说明它会自动出现于看板和项目故事。

### 3. 生成项目故事与复盘

用户说“项目介绍、复盘、给非技术人员分享、梳理问题和解决过程、整份文档”时，生成：

```bash
node "<plugin-root>/src/cli.mjs" narrative \
  --project <project-path> \
  --output docs/project-story.md
```

文档有两层：

1. 给非技术读者的项目目标、当前成果、风险与重点；
2. 给技术人员的架构取舍、issue 的问题—处理方式—验证证据，以及来源索引。

生成后，必须说明：

- 文档基于源记录与 Git，不是 AI 对缺失事实的补写；
- `待补证` 表示缺少 work/test/merge 关联，并不代表失败；
- 高层摘要可供分享，但对外发布前仍要人工检查机密、内部路径和未公开信息。

不要把未验证的 checkbox、讨论结论或 session note 表述成生产已经完成。

### 4. 运行本地看板

用户需要可交互视图时运行：

```bash
node "<plugin-root>/src/server.mjs" --project <project-path>
```

默认地址是 `http://127.0.0.1:47931`。页面本地读取源文件；点击刷新会重新扫描。不要把该本地服务暴露到网络，除非用户明确要求并完成访问控制设计。

## 与 Loctek 生命周期的配合

- `loctek-issue`：执行任务的权威入口；Issue 卡由 `.changes/issues/` 自动产生。
- `loctek-work`：实施过程的权威记录；work report 会在 issue 详情与复盘中成为证据。
- `loctek-test` / `loctek-commit` / `loctek-merge`：测试、提交、合并证据进入同一条 issue 链路。
- `loctek-archive`：归档完成后不默认显示为活跃任务；项目故事只将它作为历史上下文。
- Session note 仍保存关键即时决策；需要持续检索和看板展示的方案/计划，用 discussion/plan 记录承载。

## 成功标准

- 源记录仍是唯一权威，且新增记录短小、无敏感信息、带来源关联；
- 讨论、计划、issue、证据和决策能在一次 scan 中互相链接；
- 项目故事区分完成事实、进行中工作与待补证；
- 用户无需重新翻完整聊天记录，就能在看板或项目故事中定位结论与证据。
