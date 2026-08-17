---
type: issue
id: ISSUE-001
issue_kind: feature
slice_type: AFK
risk: medium
status: completed
---

# 构建 Loctek Specboard 的本地优先最小闭环

## 背景

项目的 issue、关键决策、方案、工作报告、测试与合并记录散落在 `.changes/`、可选的
`openspec/`、`docs/` 和 AI 对话中。用户无法快速了解全貌，也难以把可分享的项目介绍与可复盘的技术证据串联起来。

## 目标

在不引入第二套任务事实源的前提下，提供可扫描的看板、讨论/计划沉淀入口和项目故事生成器。

## 非目标

- 不替代 `loctek-issue`、`loctek-work`、`loctek-test`、`loctek-commit` 的语义职责。
- 不扫描或上传全部 AI 原始会话；不保存敏感信息、凭证或未经确认的事实。
- 不把本地服务暴露到网络，也不修改 Codex 安装包或读取对话/凭据。

## 要构建什么

- 扫描 `.changes`、OpenSpec 和 Git，生成任务、讨论、计划、决策及执行证据的统一只读索引。
- 本地 Kanban 页面：状态筛选、搜索、进度、Git 创建/最近修改者、关联证据详情。
- `capture` 命令写入 `.changes/discussions/` 或 `.changes/plans/`，让 AI 对话结论成为短小可追溯记录。
- `narrative` 命令生成由浅入深的项目故事：非技术摘要、技术决策、问题/处理/验证链路和来源索引。
- 提供跨项目本机注册表和组合视图；相同 issue ID 仍按所属项目隔离。
- 作为第二次迭代，提供仅针对独立 Codex profile 窗口的非官方侧栏入口：通过 loopback CDP 注入 `Specboard` 按钮和本机 iframe，不影响普通 Codex 窗口。

## 验收标准

- [x] 可扫描 Loctek issue、work/test/merge 等证据、ADR/session note 和 OpenSpec change；不要求迁移现有项目文件。
- [x] issue/OpenSpec checklist 进度从 Markdown checkbox 机械计算；没有 checklist 时明确显示未知。
- [x] Git 历史能展示创建者和最近修改者，未提交改动不会伪造作者。
- [x] discussion/plan 写入后可立即再次扫描到，且带关联 issue/ADR。
- [x] 项目故事区分已完成证据、进行中工作与待补证，保留源路径。
- [x] 测试覆盖扫描、记录沉淀和叙事生成；可在 `loctek-ai-cowork` 真正扫描运行。
- [x] 可登记多个本机项目并聚合扫描，重复 issue ID 不会混淆。
- [x] 在独立 Codex 窗口可挂载 `Specboard` 侧栏入口；CDP 与 iframe 均限制为 loopback。

## 被阻塞

无长期阻塞。插件已通过仓库内 local marketplace 安装；侧栏入口属于非官方兼容层，Codex 更新后可能需要维护 selector。

## 影响范围

独立仓库 `/Users/andy/plugins/loctek-specboard`、本机项目注册表和独立 Codex profile；被扫描项目仅在用户执行 `capture` 时写入 `.changes/discussions/` 或 `.changes/plans/`。

## 必须保留的行为

- `.changes` / `openspec` / Git 是唯一权威；本地索引可重建。
- 重要用户决策仍可写 session note；需要长期检索的讨论或计划另建独立卡。
- 项目故事不把 checkbox、讨论或环境描述误写成生产事实。
- 侧栏集成仅向由自身启动、端口为 `127.0.0.1:9232` 的独立 Codex 窗口注入；不触碰既有窗口、应用二进制、会话或凭据。

## 测试计划

运行 `npm test`、语法检查、插件 manifest 校验；以 `loctek-ai-cowork` 执行真实 scan/narrative/server smoke。

## 回滚考虑

删除独立插件仓库及其本地服务即可；不会破坏被扫描项目的既有记录。若已创建 discussion/plan，它们是普通可审计 Markdown，可按 Git 回退。
