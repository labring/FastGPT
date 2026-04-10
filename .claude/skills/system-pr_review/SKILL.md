---
name: pr-review
description: 当用户传入一个 review 的 pr 链接时候，触发该 skill，对 pr 进行代码审查。
---

# When to Use This Skill

用户传入一个 review 的 pr 链接

# PR Review 代码审查技能

> 全面审查 Pull Request 的代码质量、安全性、性能和架构设计,提供专业的改进建议

## 快速开始

```bash
# 审查当前分支的 PR
gh pr view

# 审查指定 PR
gh pr view 6324

# 查看变更内容
gh pr diff 6324
```

## 工具集成

### 使用 gh CLI 加速审查

```bash
# 查看并审查 PR
gh pr view <number> && gh pr diff <number>

# 添加审查评论
gh pr review <number> --comment -b "我的审查意见"

# 批准 PR
gh pr review <number> --approve

# 请求修改
gh pr review <number> --request-changes
```

### 本地测试 PR

```bash
# 检出 PR 分支到本地
gh pr checkout <number>

# 运行测试
pnpm test

# 运行 lint
pnpm lint

# 类型检查
pnpm tsc --noEmit

# 启动开发服务器验证
pnpm dev
```

### 常见命令参考

```bash
# PR 信息查看
gh pr view --json title,body,author,state,files,additions,deletions

# PR diff 查看
gh pr diff
gh pr diff <number> > /tmp/pr.diff  # 保存到文件

# PR commits 查看
gh pr view --json commits --jq '.commits[].messageHeadline'

# PR checks 状态
gh pr checks

# PR 评论
gh pr comment <number> --body "评论内容"

# PR 审查提交
gh pr review <number> --approve
gh pr review <number> --request-changes
gh pr review <number> --comment -b "评论内容"

# PR 操作
gh pr merge <number> --squash  # Squash merge
gh pr close <number>           # 关闭 PR
```

## 审查流程

### 1. 信息收集阶段

自动执行以下步骤:

```bash
# 1. 获取 PR 基本信息
gh pr view --json title,body,author,state,headRefName,baseRefName,additions,deletions,files

# 2. 获取 PR 变更 diff
gh pr diff

# 3. 获取 PR 的 commit 历史
gh pr view --json commits

# 4. 检查 CI/CD 状态
gh pr checks
```

### 2. 多维度代码审查

按照以下三个维度进行系统性审查:

#### 维度 1: 基本代码质量标准 📐

通用的代码质量标准,适用于所有项目:

- **安全性**: 输入验证、权限检查、注入防护、敏感信息保护
- **正确性**: 错误处理、边界条件、类型安全
- **性能**: 算法复杂度、数据库优化、内存管理
- **可测试性**: 测试覆盖、测试质量、Mock 使用

📖 **详细指南**: [code-quality-standards.md](./code-quality-standards.md)

#### 维度 2: FastGPT 风格规范 🎨

FastGPT 项目特定的代码规范和约定:

- **API 路由开发**: 路由定义、权限验证、错误处理: [API 路由开发规范](./style/api.md)
- **前端组件开发**: TypeScript + React、Chakra UI、状态管理: [前端组件开发规范](./style/front.md)
- **数据库操作**: Model 定义、查询优化、索引设计: [数据库操作规范](./style/db.md)
- **包结构与依赖**: 依赖方向、导入规范、类型导出: [包结构与依赖规范](./style/package.md)
- **日志与可观测性**: 统一日志分类、结构化字段、敏感信息、OTEL 导出等审查标准: [日志review 标准](./style/logger.md)

#### 维度 3: 常见问题检查清单 🔍

快速识别和修复常见问题模式:

- **TypeScript 问题**: any 类型滥用、类型定义不完整、不安全断言
- **异步错误处理**: 未处理 Promise、错误信息丢失、静默失败
- **React 性能**: 不必要的重渲染、渲染中创建对象、缺少 memoization
- **安全漏洞**: 注入攻击、XSS、文件上传漏洞

📖 **详细清单**: [common-issues-checklist.md](./common-issues-checklist.md)

### 3. 生成并提交审查报告

PR 审查输出分为两个部分:
1. **整体审查报告**: 提交为 PR 顶部的总体评论
2. **行级代码评论**: 直接在代码行的位置添加具体评论

#### 步骤 1: 分析代码并准备评论

在审查过程中,需要为每个问题记录:
- **文件路径**: 如 `packages/service/core/workflow/dispatch.ts`
- **行号**: 如 `L142-L150`
- **问题类型**: 🔴严重 / 🟡改进 / 🟢优化
- **评论内容**: 具体的问题描述和建议


#### 步骤 2: 提交代码审查评论

GitHub CLI 的 `gh pr review` 命令不支持直接提交行级评论，需要使用 GitHub API。

```bash
# 1. 获取仓库信息
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# 2. 准备 review 数据（包含行级评论）
cat > /tmp/review-data.json << 'EOF'
{
  "body": "## 📊 代码审查总结\n\n详细的审查意见请查看下方的行级评论。",
  "event": "COMMENT",
  "comments": [
    {
      "path": "packages/service/core/workflow/dispatch.ts",
      "line": 142,
      "body": "🔴 **严重问题**: 这里缺少错误处理,如果 runtimeNode 为 null 会导致运行时错误。\n\n**建议**:\n```typescript\nif (!runtimeNode) {\n  throw new Error(`Runtime node not found: ${nodeId}`);\n}\n```"
    },
    {
      "path": "packages/service/core/workflow/dispatch.ts",
      "line": 150,
      "body": "🟡 **性能优化**: 建议将此正则表达式编译提取到函数外部,避免每次调用都重新编译。\n\n**建议**:\n```typescript\nconst NODE_ID_PATTERN = /^node_([a-f0-9]+)$/; // 在模块顶部定义\n```"
    }
  ]
}
EOF

# 3. 使用 GitHub API 提交 review
gh api repos/$REPO/pulls/<number>/reviews \
  --method POST \
  --input /tmp/review-data.json
```


#### 步骤 3: 生成整体审查报告

```markdown
# PR Review: {PR Title}

## 📊 变更概览
- **PR 编号**: #{number}
- **作者**: @author
- **分支**: {baseRefName} ← {headRefName}
- **变更统计**: +{additions} -{deletions} 行
- **涉及文件**: {files.length} 个文件

## ✅ 优点
{列出做得好的地方}

## ⚠️ 问题汇总

### 🔴 严重问题 ({count} 个,必须修复)
{简要列出每个严重问题,并在下方添加行级评论}

### 🟡 建议改进 ({count} 个)
{简要列出每个建议}

### 🟢 可选优化 ({count} 个)
{简要列出优化建议}

## 🧪 测试建议
{建议的测试方法}

## 💬 总体评价
- **代码质量**: ⭐⭐⭐⭐☆ (4/5)
- **安全性**: ⭐⭐⭐⭐⭐ (5/5)
- **性能**: ⭐⭐⭐⭐☆ (4/5)
- **可维护性**: ⭐⭐⭐⭐☆ (4/5)

## 🚀 审查结论
{建议: 通过/需修改/拒绝}

---

## 📍 详细代码评论
已在以下位置添加了具体的行级评论:
{列出所有添加了行级评论的位置}
```

#### 步骤 4: 提交整体审查报告

通过 GitHub CLI 提交整体审查报告到评论区。

#### 审查命令快速参考:

| 场景 | 命令 |
|------|------|
| 批准 PR | `gh pr review <number> --approve` |
| 请求修改 | `gh pr review <number> --request-changes` |
| 一般评论 | `gh pr review <number> --comment` |
| 从文件提交 | `gh pr review <number> --body-file /tmp/review.md` |
| 添加普通评论 | `gh pr comment <number> --body "内容"` |
| 撤销审查 | `gh pr review <number> --dismiss` |



