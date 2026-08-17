---
type: discussion
id: DISC-20260817-001
status: active
created_by: "yeshaojun <>yeshaojun5056@163.com"
links:
  - DISC-20260816-001
---

# 仓库原生的 Codex 协作任务系统

## 背景

面向 AI 时代开发协作，以 Codex、项目内 Markdown 和任务看板组成闭环，不接入外部 Issue Tracker 或任务数据库。

## 结论

不接入 GitHub/GitLab/Jira 等连接器；任务、负责人、评论、状态、方案、决策和证据均写入项目内版本控制的 Markdown。看板仅扫描、索引、关联和受控写入，Codex 负责把讨论沉淀为可审阅记录。优先建设统一数据模型、AI 沉淀、闭环协作、分享与复盘。

新建 Issue 的 `created_by` 同时作为默认 `assignee`；后续交接仅改负责人字段，且由看板追加协作动态。任务状态只是协作信号，不替代 Loctek Work/Test/Archive 的真实执行证据。

## 方案与步骤

- [ ] 将结论拆成可验证的后续行动。

## 放弃方案

不采用中心化数据库和双写同步，避免脱离项目事实源；不采用外部 Tracker 连接器，避免改变现有 Codex + Git + Markdown 工作流。

## 未决问题

跨仓库项目组合方式、分享页的脱敏规则，以及全局 `loctek-issue` 安装包模板的发布权限仍需处理；负责人、状态、评论的 Markdown 协议已由 Specboard MVP 定义。

## 关联记录

- DISC-20260816-001
