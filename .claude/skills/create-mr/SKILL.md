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

### 1. 获取当前分支名

```bash
cd "d:/ai-build/FastGPT"
branch=$(git rev-parse --abbrev-ref HEAD)
echo "当前分支: $branch"
```

### 2. 读取 GitLab 配置

```bash
cd "d:/ai-build/FastGPT"
env_file="projects/app/.env.local"

# 从 .env.local 读取配置（如果存在）
if [ -f "$env_file" ]; then
  set -a
  source "$env_file"
  set +a
fi

# 设置 GitLab 配置（环境变量优先，否则使用默认值）
GITLAB_PRIVATE_TOKEN="${GITLAB_PRIVATE_TOKEN:-**}"
GITLAB_BASE_URL="${GITLAB_BASE_URL:-http://mq.code.sangfor.org}"
GITLAB_PROJECT_ID="${GITLAB_PROJECT_ID:-15836}"
GITLAB_TARGET_BRANCH="${GITLAB_TARGET_BRANCH:-develop-1.3.0}"

echo "Base URL: $GITLAB_BASE_URL"
echo "Project ID: $GITLAB_PROJECT_ID"
echo "Target Branch: $GITLAB_TARGET_BRANCH"
```

### 3. 读取 TD 信息

```bash
# 从分支名提取 TD 纯数字 ID（分支名格式如 76887/2025080700223 或 fix/TD-2025080700223）
td_id=$(echo "$branch" | grep -oP '\d{8,}' | head -1 || echo "")

# 如果分支名无法提取，尝试从最近 commit 获取
if [ -z "$td_id" ]; then
  td_id=$(git log -1 --format="%s" | grep -oP '\d{8,}' | head -1 || echo "")
fi

# TD 跳转链接
td_url="https://td.sangfor.com/#/defect/details/${td_id}"

# 读取 TD 文档全文内容
td_file=".frieren/agent-tasks/TD/${td_id}.md"
td_title=""
td_content=""

if [ -f "$td_file" ]; then
  td_title=$(grep -E "^# " "$td_file" | sed 's/^# //' | head -1)
  td_content=$(cat "$td_file")
else
  echo "⚠ TD 文件不存在: $td_file，使用分支名作为标题"
fi
```

### 4. 创建 MR

```bash
# 构建 MR 标题和描述（包含 TD 链接 + TD 文档全文）
mr_title="WIP: fix: ${td_id} ${td_title}"
mr_description="TD 链接: ${td_url}

${td_content}"

# 调用 GitLab API（使用 jq 构建 JSON，避免特殊字符转义问题）
response=$(curl -s -X POST "${GITLAB_BASE_URL}/api/v4/projects/${GITLAB_PROJECT_ID}/merge_requests" \
  --header "PRIVATE-TOKEN: ${GITLAB_PRIVATE_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$(jq -n \
    --arg sb "$branch" \
    --arg tb "$GITLAB_TARGET_BRANCH" \
    --arg title "$mr_title" \
    --arg desc "$mr_description" \
    '{source_branch: $sb, target_branch: $tb, title: $title, description: $desc, remove_source_branch: true, draft: true}'
  )")

# 输出结果
web_url=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('web_url',''))" 2>/dev/null)
iid=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('iid',''))" 2>/dev/null)

if [ -n "$web_url" ]; then
  echo "✅ MR 创建成功！"
  echo "MR 链接: $web_url"
  echo "MR 编号: $iid"
else
  echo "❌ MR 创建失败"
  echo "响应: $response"
fi
```

## 完整脚本

也可以直接执行以下完整脚本一键创建 MR：

```bash
cd "d:/ai-build/FastGPT"
env_file="projects/app/.env.local"

[ -f "$env_file" ] && { set -a; source "$env_file"; set +a; }

GITLAB_PRIVATE_TOKEN="${GITLAB_PRIVATE_TOKEN:-**}"
GITLAB_BASE_URL="${GITLAB_BASE_URL:-http://mq.code.sangfor.org}"
GITLAB_PROJECT_ID="${GITLAB_PROJECT_ID:-15836}"
GITLAB_TARGET_BRANCH="${GITLAB_TARGET_BRANCH:-develop-1.3.0}"

branch=$(git rev-parse --abbrev-ref HEAD)

# 提取纯数字 TD ID（8位以上，如 2025080700223）
td_id=$(echo "$branch" | grep -oP '\d{8,}' | head -1 || git log -1 --format="%s" | grep -oP '\d{8,}' | head -1 || echo "")

td_url="https://td.sangfor.com/#/defect/details/${td_id}"
td_file=".frieren/agent-tasks/TD/${td_id}.md"
td_title=""
td_content=""

[ -f "$td_file" ] && {
  td_title=$(grep -E "^# " "$td_file" | sed 's/^# //' | head -1)
  td_content=$(cat "$td_file")
}

mr_title="WIP: fix: ${td_id} ${td_title}"
mr_description="TD 链接: ${td_url}

${td_content}"

response=$(curl -s -X POST "${GITLAB_BASE_URL}/api/v4/projects/${GITLAB_PROJECT_ID}/merge_requests" \
  --header "PRIVATE-TOKEN: ${GITLAB_PRIVATE_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$(jq -n \
    --arg sb "$branch" \
    --arg tb "$GITLAB_TARGET_BRANCH" \
    --arg title "$mr_title" \
    --arg desc "$mr_description" \
    '{source_branch: $sb, target_branch: $tb, title: $title, description: $desc, remove_source_branch: true, draft: true}'
  )")

echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
url = data.get('web_url', '')
iid = data.get('iid', '')
if url:
    print(f'✅ MR Created!')
    print(f'MR URL: {url}')
    print(f'MR IID: {iid}')
else:
    print(f'❌ Failed: {json.dumps(data, indent=2)}')
" 2>/dev/null || echo "Response: $response"

[ -f "$td_file" ] && rm "$td_file" && echo "Cleaned up: $td_file"
```
