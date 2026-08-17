# Specboard data model

## The source stays authoritative

Specboard does not turn project knowledge into an opaque second database.
Every card points to one or more Markdown files, and every displayed author or
last modifier is derived from Git when possible. Uncommitted source changes are
shown as local and unattributed.

## Card types

| Card | Source | Purpose |
| --- | --- | --- |
| `issue` | `.changes/issues/*.md` | Executable work with acceptance criteria |
| `discussion` | `.changes/discussions/*.md` | A durable, concise AI/human discussion outcome |
| `plan` | `.changes/plans/*.md` | A staged plan that can link to issues |
| `decision` | `.changes/adr/*.md` and `session-notes/*.md` | Constraints and chosen tradeoffs |
| `openspec-change` | `openspec/changes/*` | Proposed behavior change and task checklist |

The scanner also emits evidence records for work reports, tests, intents, merge
reports, PRs, releases and session notes.

## Issue collaboration protocol

An executable Issue may carry its collaboration information in frontmatter. The
field names are deliberately small so they remain easy to review in Git:

```markdown
---
type: issue
id: ISSUE-003
created_by: "创建者"
assignee: "创建者"
reviewers:
  - "Alice"
status: in_progress
---

# 任务标题

## 协作动态

- 2026-08-17 11:20 · yeshaojun · 指派
  负责人：yeshaojun → Alice

- 2026-08-17 11:25 · Alice · 评论
  需要先确认权限边界。
```

- `created_by` is immutable authorship. New Loctek issues should set it from
  `git config user.name`.
- `assignee` is the current accountable person. It defaults to `created_by`.
  For older files that do not have either field, Specboard falls back to the
  Git creator, then to `未识别`.
- `reviewers` is optional; it is informational and never treated as an access
  control list.
- `协作动态` is append-only. Status/assignee changes and comments must add an
  entry instead of rewriting history.

The allowed task states are `draft`, `backlog`, `todo`, `active`, `proposed`,
`in_progress`, `in_review`, `blocked`, `done`, `completed`, `archived`,
`closed` and `accepted`. A state is only workflow metadata: it does not claim
that implementation, testing or archive validation occurred.

## Controlled local write-back

The local server accepts `PATCH /api/projects/:projectId/issues/:issueId` only
for a project present in its local registry and an Issue currently found below
that project's `.changes/issues/` directory. It accepts only `assignee`,
`status` and `comment`; arbitrary paths, file contents and authors are never
accepted from the browser. The writer is derived from that project's
`git config user.name`, and the server still binds to `127.0.0.1` only.

This means Git remains the shared audit trail. A human can review the exact
frontmatter change and appended activity before committing it.

## Progress is evidence, not guesswork

- issue progress is checked acceptance criteria divided by all acceptance
  criteria; when none exist it is `unknown`;
- an OpenSpec change uses checked tasks divided by all tasks;
- plan progress uses checked plan steps when present;
- a status such as `in_progress` is shown independently from checklist progress.

## Creating a discussion or plan

`capture` writes a Markdown file with frontmatter and these sections:

```markdown
---
type: discussion
id: DISC-20260816-001
status: active
links:
  - ISSUE-066
---

# Title

## 背景
## 结论
## 方案与步骤
## 放弃方案
## 未决问题
## 关联记录
```

For a `plan`, `## 方案与步骤` uses Markdown checkboxes so that progress remains
mechanically verifiable.

## Project story document

The generator writes two layers in one document:

1. **分享摘要** — problem, scope, outcomes and active risks in plain language;
2. **技术复盘** — architecture decisions, problem/evidence/solution/validation
   chains, current work, and source index.

Source file paths are retained for audit. A later AI-assistance pass may improve
wording, but it must cite source cards and label any inference as an inference.
