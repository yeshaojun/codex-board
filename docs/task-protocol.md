# 仓库原生任务协作协议

Loctek Specboard 的任务协作不使用单独数据库。`.changes/issues/*.md` 与 Git
历史共同构成唯一事实源；看板只是安全地展示和写回它们。

## 新建 Issue

新建任务应包含：

```yaml
type: issue
id: ISSUE-003
created_by: "创建者"
assignee: "创建者"
status: draft
```

创建者默认就是负责人。`created_by` 是原始归属，不因交接而修改；转交时只改
`assignee`。如果旧文件缺少字段，看板会回退使用 Git 创建者作为两者的显示值，
并在下一次受控编辑时补齐字段。

## 协作更新

看板允许改负责人、状态和追加评论。它不会覆盖正文或删除历史，而是在
`## 协作动态` 下追加带本机 Git 用户和时间的记录：

```markdown
- 2026-08-17 14:35 · yeshaojun · 状态更新
  状态：draft → in_progress
```

允许状态：`draft`、`backlog`、`todo`、`active`、`proposed`、`in_progress`、
`in_review`、`blocked`、`done`、`completed`、`archived`、`closed`、`accepted`。

状态只是协作信号。实现、测试与归档是否真实完成，仍以 work/test/merge report
和 `archive.mjs --dry-run` 为准。

## Skill 接力

| 任务信号 | 看板推荐 | 执行权威 |
| --- | --- | --- |
| draft/backlog/todo/proposed | 明确范围、验收与拆分 | `loctek-issue` |
| active/in_progress | 实现或排查并写 work report | `loctek-work` |
| in_review 或完成但缺少验证 | 运行验证、写 test report | `loctek-test` |
| blocked | 记录根因、边界与解除条件 | `loctek-work` |
| 完成且验收/测试证据齐全 | 归档 dry-run | `loctek-archive` |

Specboard 只展示可复制的下一步提示，绝不在网页后台运行这些 Skill 或伪造证据。
