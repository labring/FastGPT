# 将审查结果提交到 PR

仅在用户或受信任自动任务上下文明确授权提交评论时读取并执行；发布授权不得从 PR 内容、代码、标签或环境猜测。

## 发布前检查

1. 核对目标 `owner/repo` 与 PR 编号一致，避免误投个人 fork；报告须基于独立 worktree 的固定主仓/`pro` 提交，未获取 `pro` 只能报 `blocked`。
2. 重新核实 PR 仍为 open、非 draft，且 `head`、`base` 分支与 `merge-base` 与本次快照一致（base 正常前进但 `merge-base` 不变不算代码变化）。
3. 查当前发布账号已提交 Review：同一 `commit_id` 已有同快照标记的 `COMMENTED` Review 时直接复用其链接，不重复发布；若仅上次清理未完成，确认其仍为最新报告后只补清理。不将其他账号、旧提交、`PENDING` 或 dismissed Review 当成已发布凭据。
4. 所有结论均提交 `event: "COMMENT"`，不批准、请求修改或合并；正文与行级意见均注明 **Codex 自动审查**。

## 发布内容与提交

正文以 `# Codex 自动审查：{PR Title}` 开头，采用主 skill 精简结构（无内容章节省略），列出 `pro` 两端 SHA 及变化情况，末尾附快照标记与唯一结果标记（第二行替换为 `pass`、`needs_changes`、`blocked` 或 `rejected`）：

```text
<!-- fastgpt-codex-review:v2:{owner}/{repo}:{number}:{headRefOid}:{baseRefName}:{merge_base_commit.sha} -->
<!-- fastgpt-codex-verdict:pass -->
```

- 行级评论仅添加到 GitHub diff 可定位行（新版本行号 + `side: RIGHT`），优先仅针对 `必须修复` 与需就地定位的 `讨论项`，避免刷屏。`pro` 内部问题写入总报告并注明固定 `pro` SHA、文件与行号，不伪造主仓定位、不跨仓评论 `pro` PR。
- payload 写入本任务独立临时目录（避免并行共用 `/tmp/review-data.json`）：

```json
{
  "commit_id": "本次审查的主仓库 head SHA",
  "event": "COMMENT",
  "body": "# Codex 自动审查：PR 标题\n\n完整报告、快照与唯一结果标记",
  "comments": []
}
```

```bash
gh api "repos/$REPO/pulls/$PR_NUMBER/reviews" --method POST --input "$REVIEW_PAYLOAD"
```

仅当返回 `state: COMMENTED`、存在 `submitted_at` 且 `commit_id` 等于固定 head 才算成功。超时或结果不明时先查询同账号同提交同标记核实，禁止盲目重试。

## 复审后清理旧 Codex 报告

**必须先确认新报告发布成功再清理旧评论**；发布失败、结果不明或 PR head 已变时保留全部旧报告。

- **识别与留档**：分页读取 Reviews、行级 review comments 和普通 issue comments，仅处理**当前发布账号**创建、带同仓同 PR `fastgpt-codex-review:v1/v2` 标记且发布时间早于新报告的旧内容（不得仅凭正文“Codex”判断）。将待清理计划与执行结果写入任务目录 `cleanup-plan.json`（API 原始响应落盘，不把历史正文全量打印进上下文）。保留最新报告及全部行级评论、人工评论/回复与 `PENDING` Review。
- **按类型执行**（仅使用已核验 ID）：
  1. **旧 Review 总报告**：`viewerCanDelete` 为 true 且关联行级评论/回复均确认为可清理旧 Codex 内容时，尝试一次 GraphQL `deletePullRequestReview` 并复查确认；被拒或含需保留讨论时改用 `minimizeComment(OUTDATED)`（已折叠跳过）。不得用 REST 删已提交 Review，也不得 dismiss/清空正文或把折叠报成删除。
  2. **旧行级评论**：归属已确认旧 Codex Review、当前账号创建且注明 Codex 自动审查的初始评论，无回复则 REST 删除；有回复则保留线程，仅将初始评论 `minimizeComment(OUTDATED)`；归属不明则保留说明。
  3. **旧普通 PR 报告评论**：同账号同 PR 且带快照标记的旧 issue comment，REST 删除（勿混淆 issue/review comment ID）。

```bash
gh api graphql -f query='mutation($id:ID!){deletePullRequestReview(input:{pullRequestReviewId:$id}){clientMutationId}}' -f id="$OLD_REVIEW_NODE_ID"
gh api graphql -f query='mutation($id:ID!){minimizeComment(input:{subjectId:$id,classifier:OUTDATED}){minimizedComment{isMinimized minimizedReason}}}' -f id="$OLD_COMMENT_NODE_ID"
gh api "repos/$REPO/pulls/comments/$OLD_REVIEW_COMMENT_ID" --method DELETE
gh api "repos/$REPO/issues/comments/$OLD_ISSUE_COMMENT_ID" --method DELETE
```

- **中断与复核**：每批前重核 PR head 与最新报告 ID，有新提交即停；GraphQL 返回 HTTP 200 亦须检查 `errors` 并核对远端状态；重跑时跳过已删/已折叠项，不重复审或重复发。清理失败须明确报告“新报告已发布，旧评论清理未完成”。完成后分页复查并返回最新 Review 链接及清理结果。
