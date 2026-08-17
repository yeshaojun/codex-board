---
type: issue
id: ISSUE-003
issue_kind: feature
slice_type: AFK
risk: medium
status: in_progress
created_by: "yeshaojun"
assignee: "yeshaojun"
---

# 实现仓库原生协作任务闭环

## 背景

Specboard 已能聚合跨项目的 `.changes`、OpenSpec 与 Git 证据，但 Issue 仍是只读展示。团队无法在不离开项目 Markdown 的前提下记录负责人、状态、评论和下一步 Skill。

## 目标

让已登记项目中的活跃 `.changes/issues/*.md` 成为协作唯一事实源：新 Issue 的创建者默认是负责人；看板能受控修改负责人和状态、追加评论，并将全部变更以协作动态保留在同一文件。

## 非目标

- 不接入 GitHub、GitLab、Jira 或外部任务数据库。
- 不让网页自动执行 Loctek Skills 或伪造实现、测试、归档完成事实。
- 不修改未登记项目或 `.changes/issues/` 之外的任意文件。

## 要构建什么

- 扫描 `created_by`、`assignee`、`reviewers` 与 `协作动态`，并在缺失字段时以 Git 作者回退。
- 提供 loopback-only API，只允许对已扫描到的 Issue 写入负责人、状态和评论。
- 为状态变更、负责人变更和评论追加不可覆盖的协作动态；前端显示动态、当前负责人和推荐的 Loctek 下一步。
- 补齐任务 Markdown 协议、知识资产模板说明与自动化测试。

## 验收标准

- [x] 新 Issue 的协议明确 `created_by` 与 `assignee` 默认相同，且看板能显示负责人。
- [x] 看板可以修改负责人、状态和追加评论，且变更只写回目标项目的对应 Issue Markdown。
- [x] 每次受控变更都会留下带操作者和时间的协作动态；评论不覆盖历史。
- [x] Issue 详情能根据实际状态与证据提示应接手的 Loctek Skill，不自动代执行。
- [x] 自动化测试覆盖 Git 回退、受控写入、协作动态和生命周期建议。

## 被阻塞

全局安装的 `loctek-issue` skill 目录由系统账户所有，当前会话不能直接更新其生成脚本；看板将兼容其现有 Issue，并将默认负责人回退到 Git 创建者。

## 影响范围

- `/Users/andy/plugins/loctek-specboard/src/lib.mjs`
- `/Users/andy/plugins/loctek-specboard/src/server.mjs`
- `/Users/andy/plugins/loctek-specboard/public/`
- 插件文档、内置 Specboard Skill 与测试

## 必须保留的行为

- Markdown 和 Git 始终是事实源；不创建任务数据库。
- 服务只绑定 `127.0.0.1`，写入路径必须由已登记项目及扫描结果决定。
- Loctek Issue / Work / Test / Commit / Merge / Archive 仍分别是生命周期的执行权威。

## 测试计划

- Node 单测：扫描、写入、动态和技能推荐。
- 静态语法检查与 `npm test`。
- 本机 loopback API 和浏览器手工验证。

## 回滚考虑

回滚插件代码即可停止受控写入；已经写入 Issue 的 frontmatter 与协作动态是普通 Markdown，可保留作为审计历史或手工删除对应新增字段。
