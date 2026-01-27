---
name: pr-review
description: 进行 Pull Request 代码审查,包括代码质量、安全性、性能、架构合理性等方面的全面评估。当用户要求审查 PR 或提到 "review pr"、"检查 PR" 等关键词时激活。
---

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

#### 维度 1: 代码质量标准 📐

通用的代码质量标准,适用于所有项目:

- **安全性**: 输入验证、权限检查、注入防护、敏感信息保护
- **正确性**: 错误处理、边界条件、类型安全
- **性能**: 算法复杂度、数据库优化、内存管理
- **可测试性**: 测试覆盖、测试质量、Mock 使用

📖 **详细指南**: [code-quality-standards.md](./code-quality-standards.md)

#### 维度 2: FastGPT 风格规范 🎨

FastGPT 项目特定的代码规范和约定:

- **工作流节点开发**: 类型定义、节点枚举、执行逻辑、isEntry 管理
- **API 路由开发**: 路由定义、权限验证、错误处理
- **前端组件开发**: TypeScript + React、Chakra UI、状态管理
- **数据库操作**: Model 定义、查询优化、索引设计
- **包结构与依赖**: 依赖方向、导入规范、类型导出

📖 **详细指南**: [fastgpt-style-guide.md](./fastgpt-style-guide.md)

#### 维度 3: 常见问题检查清单 🔍

快速识别和修复常见问题模式:

- **TypeScript 问题**: any 类型滥用、类型定义不完整、不安全断言
- **异步错误处理**: 未处理 Promise、错误信息丢失、静默失败
- **React 性能**: 不必要的重渲染、渲染中创建对象、缺少 memoization
- **工作流节点**: isEntry 未重置、交互历史未清理、白名单遗漏
- **安全漏洞**: 注入攻击、XSS、文件上传漏洞

📖 **详细清单**: [common-issues-checklist.md](./common-issues-checklist.md)

### 3. 生成并提交审查报告

#### 步骤 1: 生成审查报告

按照标准结构输出审查结果:

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

## ⚠️ 问题与建议

### 🔴 严重问题 (必须修复)
{列出阻塞性问题}

### 🟡 建议改进 (推荐修复)
{列出需要改进的地方}

### 🟢 可选优化 (锦上添花)
{列出优化建议}

## 📋 具体代码审查
{针对关键代码片段的详细点评}

## 🧪 测试建议
{建议的测试方法或测试用例}

## 💬 总体评价
- **代码质量**: ⭐⭐⭐⭐☆ (4/5)
- **安全性**: ⭐⭐⭐⭐⭐ (5/5)
- **性能**: ⭐⭐⭐⭐☆ (4/5)
- **可维护性**: ⭐⭐⭐⭐☆ (4/5)

## 🚀 审查结论
{建议: 通过/需修改/拒绝}
```

#### 步骤 2: 提交审查报告到 PR

将生成的审查报告提交到对应的 PR 评论区:

**作为审查评论提交 **

```bash
# 1. 将审查报告保存到文件
cat > /tmp/pr-review.md << 'EOF'
# (粘贴你的审查报告内容)
EOF

# 2. 提交审查评论
gh pr review <number> --comment --body-file /tmp/pr-review.md

# 3. 根据审查结论选择相应的命令:
# - 如果通过: gh pr review <number> --approve --body-file /tmp/pr-review.md
# - 如果需要修改: gh pr review <number> --request-changes --body-file /tmp/pr-review.md
# - 一般评论: gh pr review <number> --comment --body-file /tmp/pr-review.md
```

#### 实用技巧

**批量提交多个文件的审查意见**:

```bash
# 如果审查内容较长,可以分文件编写
cat > /tmp/pr-review-approval.md << 'EOF'
## ✅ 优点
- 代码结构清晰
- 测试覆盖完整
EOF

cat > /tmp/pr-review-issues.md << 'EOF'
## ⚠️ 问题

### 🔴 严重问题
- 问题1: 安全漏洞
- 问题2: 错误处理缺失
EOF

# 合并并提交
cat /tmp/pr-review-*.md > /tmp/pr-review-full.md
gh pr review <number> --request-changes --body-file /tmp/pr-review-full.md
```

**使用模板快速生成审查报告**:

```bash
# 创建审查报告模板
cat > /tmp/pr-review-template.md << 'EOF'
# PR Review: {PR_TITLE}

## 📊 变更概览
- **PR 编号**: {PR_NUMBER}
- **作者**: @{PR_AUTHOR}
- **变更**: +{ADDITIONS} -{DELETIONS}

## ✅ 优点
-

## ⚠️ 问题与建议
-

## 💬 总体评价
-
EOF

# 使用变量填充模板
export PR_NUMBER=6324
export PR_TITLE=$(gh pr view $PR_NUMBER --json title -q .title)
export PR_AUTHOR=$(gh pr view $PR_NUMBER --json author -q .author.login)
export ADDITIONS=$(gh pr view $PR_NUMBER --json additions -q .additions)
export DELETIONS=$(gh pr view $PR_NUMBER --json deletions -q .deletions)

# 替换模板中的变量
envsubst < /tmp/pr-review-template.md > /tmp/pr-review.md
```

**审查命令快速参考**:

| 场景 | 命令 |
|------|------|
| 批准 PR | `gh pr review <number> --approve` |
| 请求修改 | `gh pr review <number> --request-changes` |
| 一般评论 | `gh pr review <number> --comment` |
| 从文件提交 | `gh pr review <number> --body-file /tmp/review.md` |
| 添加普通评论 | `gh pr comment <number> --body "内容"` |
| 撤销审查 | `gh pr review <number> --dismiss` |


## 参考文档

### 核心审查文档
- **维度 1**: [code-quality-standards.md](./code-quality-standards.md) - 通用代码质量标准
- **维度 2**: [fastgpt-style-guide.md](./fastgpt-style-guide.md) - FastGPT 项目规范
- **维度 3**: [common-issues-checklist.md](./common-issues-checklist.md) - 常见问题清单
