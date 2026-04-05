# fix: 模型渠道配置体验改进 — 无 AI Proxy 时的替代方案与直连 API 测试

关联: #6525  
分支: `fix/issue-6525-aiproxy-channel-stability`（提交 `a20ec2e47`）

---

## 背景

自部署用户在不使用或未正确配置 **AI Proxy** 时，容易在渠道管理页遇到 **fetch failed**，或在模型测试中因 **base_url / 路径** 填写不当出现 **404**。本 PR 在错误提示、API 测试路径与文档上补齐「可操作的」指引。

---

## 变更摘要

### 1. 用户友好的替代配置指引

- 当 **AI Proxy 不可用或未配置** 时，返回**结构化错误信息**，明确提示可改用 **自定义请求地址**（`requestUrl` / `requestAuth`）直连厂商或自建网关。
- 对网络类错误补充**可诊断**的说明（例如 Docker 内 `localhost` 指向容器自身、需改用服务名或可访问主机等）。

### 2. 直连 API 配置与模型测试

- 更新 **模型测试 API**（`projects/app/src/pages/api/core/ai/model/test.ts`）：支持在模型配置中填写 **自定义 `requestUrl` / `requestAuth`** 进行连通性测试，**不强制依赖 AI Proxy**。
- 厘清 **渠道路由** 与 **自定义请求 URL** 的适用场景：需要走统一代理/审计时用渠道 + Proxy；仅需直连官方或兼容 OpenAI 的地址时，用自定义 URL 即可。

### 3. 界面提示

- 在 **渠道管理** 相关界面（`Channel/index.tsx`）增加 **警告横幅**：当 AI Proxy 不可用或请求失败时，给出醒目提示，减少「空白失败」带来的困惑。

### 4. 文档与模板

- **中英文**文档（`document/content/docs/self-host/config/model/intro.mdx`、`intro.en.mdx`）：说明如何**在不配置 AI Proxy** 的情况下配置模型与官方 API。
- 更新 **`projects/app/.env.template`**：对 `AIPROXY_*` 等变量补充注释与可选性说明。
- 提供 **官方 API + 自定义请求 URL** 的配置示例，便于对照填写。

### 5. 其他（与 #6525 修复一致）

- **`[...path].ts`**：AI Proxy 代理层错误处理增强。
- **`channel.ts`**：`normalizeChannelBaseUrl()` 等，避免误填完整 `.../chat/completions` 路径导致 404。

---

## 涉及文件

| 文件 | 说明 |
|------|------|
| `projects/app/src/pages/api/aiproxy/[...path].ts` | AI Proxy 代理错误处理 |
| `projects/app/src/pages/api/core/ai/model/test.ts` | 自定义 URL 模型测试 |
| `projects/app/src/pageComponents/account/model/Channel/index.tsx` | 渠道页警告 UI |
| `projects/app/src/web/core/ai/channel.ts` | base_url 规范化等 |
| `projects/app/.env.template` | 环境变量说明 |
| `document/content/docs/self-host/config/model/intro.mdx` | 中文文档 |
| `document/content/docs/self-host/config/model/intro.en.mdx` | 英文文档 |

---

## 如何测试

### 方式 A：不使用 AI Proxy（替代路径）

1. **不设置**或暂时注释 `AIPROXY_API_ENDPOINT` / `AIPROXY_API_TOKEN`（按你部署方式为准）。
2. 在模型配置中填写 **`requestUrl`**（如 `https://api.openai.com/v1`）与 **`requestAuth`**（API Key）。
3. 打开 **模型测试**，应能直接验证连通性，**无需** AI Proxy。

### 方式 B：使用 AI Proxy

1. 在 `.env` 中配置例如：
   ```env
   AIPROXY_API_ENDPOINT=http://your-aiproxy-host:3010
   AIPROXY_API_TOKEN=your-token
   ```
2. 进入 **渠道管理** 等依赖代理的功能，应能正常加载；若代理宕机，应看到**明确错误与横幅提示**，而非仅「fetch failed」。

### 回归建议

- [ ] 未配置 AI Proxy 时进入渠道页：有清晰错误/指引，无未处理异常。
- [ ] 使用官方兼容地址 + 自定义 `requestUrl`：模型测试成功。
- [ ] `base_url` 误带 `/chat/completions` 等后缀：保存/请求前被规范化，避免 404。

---

## 合并说明（供维护者）

- **不依赖** GitHub/GitLab 上再开 PR 时，可将本文件作为描述粘贴；本地仅作备份与评审用。
- 若远程使用 **私有仓库**，将本分支推送至 `origin` 后，在内部按流程评审合并即可。
