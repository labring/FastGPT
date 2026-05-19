---
name: create-mr
description: TD 修复完成后，读取 GitLab 配置创建 Merge Request
---

# Create GitLab Merge Request

TD 修复完成后，调用此 skill 创建 GitLab MR。

## 配置说明

从 `projects/app/.env.local` 中读取 GitLab 配置，支持以下字段：

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `GITLAB_PRIVATE_TOKEN` | GitLab Personal Access Token | `**` |
| `GITLAB_BASE_URL` | GitLab API 基础地址 | `http://mq.code.sangfor.org` |
| `GITLAB_PROJECT_ID` | GitLab 项目 ID | `15836` |
| `GITLAB_TARGET_BRANCH` | MR 目标分支 | `develop-1.3.0` |

如果 `.env.local` 中未配置，则使用上述默认值。

## 执行步骤

### 1. 获取配置和分支名

```bash
cd "d:/ai/FastGPT-1.3.0"
branch=$(git rev-parse --abbrev-ref HEAD)
td_id="<由 Agent 从分支名或上下文提取的 TD 编号>"
```

### 2. 读取 .env.local 并设置环境变量

```bash
cd "d:/ai/FastGPT-1.3.0"

export GITLAB_PRIVATE_TOKEN=$(grep -oP 'GITLAB_PRIVATE_TOKEN=\K.*' projects/app/.env.local 2>/dev/null || echo '**')
export GITLAB_BASE_URL=$(grep -oP 'GITLAB_BASE_URL=\K.*' projects/app/.env.local 2>/dev/null || echo 'http://mq.code.sangfor.org')
export GITLAB_PROJECT_ID=$(grep -oP 'GITLAB_PROJECT_ID=\K.*' projects/app/.env.local 2>/dev/null || echo '15836')
export GITLAB_TARGET_BRANCH=$(grep -oP 'GITLAB_TARGET_BRANCH=\K.*' projects/app/.env.local 2>/dev/null || echo 'develop-1.3.0')
export BRANCH="$branch"
export TD_ID="$td_id"

node .claude/skills/create-mr/create-mr.js
```

脚本路径：`.claude/skills/create-mr/create-mr.js`
- 通过环境变量读取配置
- 从 `.frieren/agent-tasks/TD/${TD_ID}.md` 读取 TD 文档内容
- MR title: `WIP: fix: {TD_ID} {问题摘要}`
- MR description: `TD 链接: {TD_URL}\n\n{TD文档全文}`
- MR draft: true, 完成后删除 source branch
