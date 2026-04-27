---
name: pr-review
description: 当用户传入一个 review 的 pr 链接时候，触发该 skill，对 pr 进行代码审查。
---

# PR Review 代码审查技能

> 按阶段对 Pull Request 进行系统性审查，先验证需求理解与逻辑正确性，再并行进行多维度质量检测，最后提交审查报告。

---

## 步骤 0：拉取代码

使用以下命令**无需切换分支**，直接使用 PR 编号即可：

```bash
# 获取 PR 基本信息
gh pr view <number> --json number,title,body,author,state,headRefName,baseRefName,additions,deletions,files

# 获取完整 diff
gh pr diff <number>

# 查看 commit 历史
gh pr view <number> --json commits --jq '.commits[].messageHeadline'

# 检查 CI 状态
gh pr checks <number>
```

如需在本地运行 **tsc / 单元测试**，使用 `git worktree` 创建独立目录，**不影响当前分支**：

```bash
# 1. 拉取 PR 代码到临时分支
git fetch upstream pull/<number>/head:pr/<number>

# 2. 在独立目录检出（与当前工作区完全隔离）
git worktree add ~/pr-worktrees/pr-<number> pr/<number>

# 3. 进入该目录安装依赖、运行测试
cd ~/pr-worktrees/pr-<number>
pnpm install
pnpm tsc --noEmit          # 类型检查
pnpm test                  # 单元测试

# 4. 审查完毕后清理
cd -
git worktree remove ~/pr-worktrees/pr-<number>
git branch -D pr/<number>
```

---

## 第一阶段：需求理解与逻辑验证

**目标**：理解本次 PR 的意图，并通过阅读代码来推理测试用例是否能通过。

### 1.1 需求总结

阅读 PR 标题、描述和 diff，用自己的语言总结：
- 本次 PR 的核心目的是什么？
- 改动了哪些关键模块？
- 对外部接口或数据结构是否有变更？

### 1.2 测试推理

充当测试角色，针对 PR 的核心改动，**提出 3~5 个关键测例**，然后在代码中找到对应逻辑进行推理校验：

- 正常路径：主流程是否按预期运行？
- 边界条件：空值、极大值、并发等边界是否被处理？
- 异常路径：错误输入或依赖失败时行为是否正确？

**校验方式**：直接阅读相关代码，推理每个测例的执行路径，确认逻辑能通过。如果代码中存在对应单元测试，也一并检查。

### ⚠️ 阶段门控

如果第一阶段发现**需求理解存在严重歧义**或**核心逻辑存在明显错误**（如测例推理无法通过），**立即跳过后续阶段，直接进入"提交评论"步骤**，在报告中标明阻塞原因，请求作者澄清或修复后再继续审查。

---

## 第二到第六阶段：并行深度审查

第一阶段通过后，**以下五个阶段可以并行执行**，彼此独立，互不依赖。

---

### 第二阶段：后端代码质量 🔒

聚焦后端（`packages/service/`、`projects/app/src/pages/api/`、`projects/app/src/service/`）的质量问题，完成以下检查清单：

- [] [后端安全](./backend-quality/security.md)
- [] [后端错误处理](./backend-quality/error-handling.md)
- [] [后端性能](./backend-quality/performance.md)

---

### 第三阶段：前端代码质量 🎨

聚焦前端（`projects/app/src/`、`packages/web/`）的质量问题，完成以下检查清单：

- [] [React 性能](./frontend-quality/react-performance.md)
- [] [前端安全](./frontend-quality/security.md)
- [] [TypeScript 质量](./frontend-quality/typescript.md)

### 第四阶段：代码风格规范 📐

对照 FastGPT 各项规范逐一检查，完成以下检查清单：

- [] [API 路由开发规范](../../design/api/index.md)
- [] [前端组件规范](./style/front.md)
- [] [数据库规范](./style/db.md)
- [] [包结构规范](./style/package.md)
- [] [日志规范](./style/logger.md)
- [] [Service 解耦规范](./style/service-decoupling.md)
- [] [语法风格规范](../../code/syntax.md)

---

### 第五阶段：测试覆盖 🧪

- 新增的核心业务逻辑是否有对应单元测试（`test/` 或 `projects/*/test/`）？
- 测试是否覆盖了正常路径、边界条件和错误路径？
- 如果没有测试，评估缺失测试的风险等级（高风险逻辑无测试应标记为 🔴）。

---

### 第六阶段：回归风险检测 🔄

- **接口兼容性**：对外 API 是否有 breaking change（字段删除、类型变更、行为变更）？
- **数据库兼容性**：schema 变更是否向后兼容？旧数据是否需要迁移？
- **依赖影响**：修改的公共模块（`packages/global/`、`packages/service/`）是否会影响其他调用方？
- **配置变更**：是否新增了必填配置项，且未提供默认值或迁移说明？

---

## 最终步骤：提交审查报告

### 收集所有阶段的问题

汇总各阶段发现的问题，按严重程度分类：
- 🔴 **严重**（必须修复才能合并）
- 🟡 **建议**（改进代码质量）
- 🟢 **可选**（优化建议）

### 提交行级代码评论

GitHub CLI 不支持行级评论，需通过 GitHub API 提交：

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

cat > /tmp/review-data.json << 'EOF'
{
  "body": "## 📊 代码审查总结\n\n详细意见请查看下方行级评论。",
  "event": "COMMENT",
  "comments": [
    {
      "path": "文件路径",
      "line": 行号,
      "body": "🔴 **问题描述**\n\n**建议**:\n```typescript\n// 修复示例\n```"
    }
  ]
}
EOF

gh api repos/$REPO/pulls/<number>/reviews \
  --method POST \
  --input /tmp/review-data.json
```

### 审查报告模板

```markdown
# PR Review: {PR Title}

## 📋 需求理解
{第一阶段总结：PR 的核心目的与改动范围}

## 🧪 逻辑验证
{列出提出的测例及推理结果，标明是否通过}

## ⚠️ 问题汇总

### 🔴 严重问题（{count} 个，必须修复）
{问题列表，行级评论已标注}

### 🟡 建议改进（{count} 个）
{问题列表}

### 🟢 可选优化（{count} 个）
{问题列表}

## ✅ 做得好的地方
{列出值得肯定的实现}

## 🚀 审查结论
{通过 / 需修改 / 阻塞（说明原因）}
```

### 命令参考

| 场景 | 命令 |
|------|------|
| 请求修改 | `gh pr review <number> --request-changes --body-file /tmp/review.md` |
| 批准 PR | `gh pr review <number> --approve` |
| 仅评论 | `gh pr review <number> --comment --body-file /tmp/review.md` |
