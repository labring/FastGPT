---
case_version: 1
id: "FG-ADMIN-CONFIG-004"
title: "子服务与存储策略：AI Proxy、代码沙箱与下载模式"
business: "admin/configuration"
types:
  - "ui"
  - "api"
  - "integration"
  - "e2e"
category: "boundary"
scenario: "special"
priority: "P0"
status: "ready"
tags:
  - "instance-config"
  - "ai-proxy"
  - "code-sandbox"
  - "agent-sandbox"
  - "storage-download"
  - "s3-runtime"
  - "secret-safety"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "ui"
  - "database"
  - "storage"
  - "log"
sources:
  - "packages/global/common/system/config/schemas/subservice.ts"
  - "packages/global/common/system/config/schemas/storage.ts"
  - "packages/global/common/system/config/pageFields.ts"
  - "packages/service/env.ts"
  - "packages/service/core/ai/config.ts"
  - "packages/service/thirdProvider/aiproxy/config.ts"
  - "packages/service/core/workflow/dispatch/tools/codeSandbox.ts"
  - "packages/service/thirdProvider/codeSandbox/index.ts"
  - "packages/service/core/ai/sandbox/config.ts"
  - "packages/service/common/s3/config/constants.ts"
  - "packages/service/common/s3/config/utils.ts"
  - "packages/service/common/s3/index.ts"
  - "projects/app/src/service/common/s3/proxy.ts"
  - "projects/app/src/pages/api/system/file/d/[signedAlias].ts"
  - "projects/app/src/pages/api/system/img/[...id].ts"
  - "projects/app/src/service/common/system/index.ts"
  - "projects/app/src/pageComponents/admin/settings/core/index.tsx"
  - "projects/app/src/pages/api/admin/system/config/probe.ts"
  - "packages/service/common/system/systemInstanceConfig/probe.ts"
  - "projects/app/src/pageComponents/admin/subservice/code-sandbox/index.tsx"
  - "projects/app/src/pageComponents/admin/subservice/mcp/index.tsx"
  - "projects/app/src/pageComponents/admin/subservice/agent-sandbox/index.tsx"
  - "packages/web/i18n/zh-CN/admin.json"
  - "packages/service/test/common/s3/config/constants.test.ts"
routes:
  - "GET /api/admin/system/config/get"
  - "POST /api/admin/system/config/update"
  - "POST /api/admin/system/config/probe"
  - "POST /api/v1/chat/completions"
  - "GET /api/common/system/getInitData"
  - "GET /api/system/file/d/{signedAlias}"
  - "GET /api/system/img/{id}"
related:
  - "FG-ADMIN-CONFIG-001"
  - "FG-ADMIN-CONFIG-003"
baseline: "ab2ad2fa4bbd069fa3cf6c1e61cc7aaadc6d3da7"
---

# 子服务与存储策略：AI Proxy、代码沙箱与下载模式

## 用例简介

管理员在页面配置代码沙箱和 MCP SSE 服务后，连通测试、业务入口和实际调用应使用同一组已保存配置；AI Proxy 与 Plugin 继续使用各自 ENV 连接。另验证对象存储下载模式切换后的地址、短链和头像行为。

## 前置准备

- 环境与版本：社区版或商业版均执行 C1/C10/C11；Agent Sandbox 和商业模型场景使用商业版部署，License 不限制配置页；准备可用的 code-sandbox 服务、一个可记录请求头和路径的 AI Proxy mock、一个可响应的 MCP SSE/HTTP mock、MinIO 环境，另有 R2 环境时执行 C7 的 R2 分支。准备一个系统 OpenAI 兼容模型和带代码节点的测试应用 Wc；准备一个 1MB 确定性文件和一张测试头像。当前字段归属：Code Sandbox 的 enabled/url/token、MCP 的 enabled/sseProxyUrl 均由实例配置提供；AI Proxy 的 endpoint/token、Plugin 的 baseUrl/token 由 ENV 提供且无对应管理页/本地开关；Agent Sandbox 的 provider Token 仍在实例配置中。
- 测试数据：记录 `subservice`、`storage` 的 revision 和当前值；记录 `AIPROXY_API_TOKEN`、`PLUGIN_TOKEN` 是否存在（只记录存在性，不记录凭据），记录 AI Proxy mock 请求计数、code-sandbox 请求计数、MinIO/R2 endpoint、当前 `STORAGE_VENDOR`、`FILE_DOWNLOAD_PUBLIC_URL_PREFIX`。准备短链所需的真实文件对象和头像对象，所有对象键带本次 run 前缀。
- 复位约定：每个子场景结束后通过 Admin API 恢复 D0（端点、enabled、MCP 地址），恢复本轮修改过的 ENV 并重启；删除测试对象。AI Proxy 缺少 ENV 后的外呼可能失败，不要求模型回答成功，只要求没有发往 mock、没有携带 Token。C8 修改 endpoint 后要恢复并确认 bucket 使用新配置。
- 验证能力：浏览器可操作子服务页/核心配置页并读取 Toast；fake AI Proxy、fake code-sandbox 和 MCP mock 记录请求；Mongo 只读查询配置；对象存储可查询对象；日志按 requestId/时间窗读取 `getAiProxyBaseUrl`、`S3` 等 callsite。不得在文档保存 mock 的 Authorization 原值。
- 条件范围：C7 接口拒绝可能映射为 500，本例验收“拒绝且零写入”，不把具体拒绝状态码作为契约。若环境无法把系统模型外呼固定到 mock（例如出口代理不可控），C2/C3 记录阻塞；无可用 provider 或 R2 时仅记录相应变体未执行，不冒充真实服务通过。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；code-sandbox 可用，D0 | 在 Code Sandbox 页开启 enabled、保存有效地址和 Token；运行 Wc 的代码节点并读取输出。再关闭 enabled 保存，重复运行同一节点；记录 code-sandbox 请求计数和节点错误。 |
| C2 | 基础；AI Proxy mock 可用 | 确认没有 AI Proxy 管理页/开关，设置 ENV `AIPROXY_API_ENDPOINT`（末尾带 `/`）及 `AIPROXY_API_TOKEN`（前后可带空格）并重启；用系统模型发起一次 `/api/v1/chat/completions`。记录 mock 收到的 path、Authorization 和请求次数；打开 Admin GET 和只读 DB，确认实例配置中没有 token 字段。 |
| C3 | 异常/安全；承接 C2 | 分别缺少 endpoint 或 Token ENV，重启后再次发起同一模型请求。等待一个完整请求周期，记录 mock 请求计数、响应/错误和服务日志；若外呼可达，记录实际回落目标。 |
| C4 | 边界；Agent Sandbox 页 D0 | 4a：把 provider 设为 `sealosdevbox` 或 `opensandbox` 且 baseUrl 留空，保存；4b：填有效 baseUrl 保存；4c：provider 设 `none` 保存。4b 后重启节点，检查 sandbox 路由/能力；无实际 provider 时只验证配置与校验。 |
| C5 | 基础；storage=short-proxy | 上传测试文件并获取短链，使用未登录/普通客户端请求短链；记录 HTTP status、Content-Type、响应体哈希和 Location。 |
| C6 | 基础；MinIO + 非空 externalEndpoint | 切换 `storage.downloadMode=short-redirect`，保存 `externalEndpoint` 和 `redirectTtlSeconds=5`；请求同一短链并跟随 302，记录 Location、`Cache-Control`、`X-Amz-Expires`/等价 TTL 和下载内容。 |
| C7 | 异常；按 vendor 选择 | 7a：MinIO 设 short-redirect、externalEndpoint 为空；7b：配置 cdnEndpoint 但 externalEndpoint 为空；7c：R2 配置 cdnEndpoint；7d：MinIO 合法 short-redirect+externalEndpoint。每次保存后查 storage revision。 |
| C8 | 边界；承接 C6 | 把 externalEndpoint 从 A 改到 B（不重启），保存后请求旧短链和新短链；再把 `STORAGE_DOWNLOAD_URL_MODE` ENV 改成 short-proxy 并重启节点，重复请求。记录 Location host 和 S3 bucket 行为。 |
| C9 | 边界；头像对象已上传 | 在 short-redirect 与 short-proxy 下分别请求同一头像 URL；记录 301/200、Location host 和字节内容。 |
| C10 | 基础；MCP mock 可用，D0 | 打开 `/admin/subservice/mcp`，启用开关、把 `subservice.mcp.sseProxyUrl` 设为 MCP mock 地址并保存；点击页面连通测试并读取初始化配置及工作台 SSE 发布选项。再关闭开关保存并重复读取，最后重新开启检查地址是否保留。 |
| C11 | 页面/异常；D0 | 核对子服务菜单无 Plugin/AI Proxy，MCP 名称为“MCP SSE 服务”。分别关闭 Code Sandbox/MCP 后检查隐藏字段；开启后尝试空字段保存，再填写合法 URL/Token 保存并刷新；探测有效服务、错误 Token、普通 HTTP 冒充服务和不可达地址。提交 query/hash/账号密码或非 HTTP(S) 的 base URL，观察拒绝；探测中修改 URL/Token，旧结果不得覆盖当前输入。 |

## 预期结果

公共断言：Code Sandbox 和 MCP SSE 的连接及开关保存后只由实例配置决定；沙箱 Token 的 GET 回显为掩码，掩码回提交保留原值，日志/证据不得暴露密钥。AI Proxy 和 Plugin 连接仍由 ENV 提供，不写入 `system_instance_configs`。缺少 AI Proxy endpoint 或 Token 时，不访问代理 mock，回落外呼也不携带代理 Token。S3 下载模式、externalEndpoint、cdnEndpoint 和 redirectTtlSeconds 以 DB 为准，环境变量只在首次迁移时 seed；配置保存成功不得被 S3 清理、头像生命周期或后台刷新失败误报为失败。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/UI + mock + DB | enabled=true 且地址、Token 完整有效时，代码节点返回 mock/沙箱的实际输出，mock 收到对应请求；enabled=false 时节点返回 `Code sandbox service is not configured or disabled`，mock 计数不增加，DB `subservice.codeSandbox.enabled=false`。恢复后再次请求立即按新值执行，无需重启。 | 节点响应、mock 计数、`system_instance_configs.subservice`。 |
| C2 | API + mock + DB | mock 只收到 `${endpoint}/v1/...`，不能出现双斜杠；Authorization 为 `AIPROXY_API_TOKEN` 去首尾空白后的值；Admin GET 不返回 token，DB 不存在 `subservice.aiProxy` 配置分支，页面无 AI Proxy 开关。 | mock 请求记录、GET 响应、DB 文档。 |
| C3 | API + mock + log | 缺少任一 ENV 后 mock 请求计数不增加，任何外呼/错误日志都不出现代理 Token；若请求回落到 `https://api.openai.com/v1`，这是允许的行为，但不要求网络成功。不得因为“模型请求失败”把配置安全断言判为通过或失败。 | mock 计数、响应/错误、日志中的 baseUrl 与脱敏后的 Authorization。 |
| C4 | UI + DB | 空 baseUrl 的 provider 保存被拒绝、无成功 Toast、revision 不变；有效 baseUrl 保存成功；`none` 保存成功。重启后 provider 读取为 DB 值；没有真实 provider 时不能把“配置已保存”当成沙箱可运行。 | 保存响应/Toast、DB、重启后 sandbox 能力/日志。 |
| C5 | API + storage | 短链返回 HTTP 200，无 `Location`，正文哈希与上传文件一致；响应由 FastGPT 代理，不把对象存储内部地址暴露给客户端。 | 短链响应、对象存储对象、哈希。 |
| C6 | API + storage | 短链返回 302，`Cache-Control: no-store`，Location 的 host 为 externalEndpoint（配置 CDN 时为 CDN host），带预签名参数；TTL 不超过 5 秒且不超过短链本身剩余有效期；跟随 Location 下载的字节与原文一致。 | 两次 HTTP 响应、Location 解析、下载哈希。 |
| C7 | API + DB | 7a/7b/7c 均被拒绝，storage revision 不变；7d 成功并保存 mode/endpoint。拒绝状态码按实现记录（当前可能为 500，业务期望 400），本用例不把错误码写成已确认契约。 | update 响应、storage 文档。 |
| C8 | API + storage + DB | 改 endpoint 后无需重启，新短链和旧短链都按当前 DB endpoint 生成 Location；S3 bucket/头像单例已重建，不继续使用旧 host。把 ENV 改为 short-proxy 并重启后仍返回 302，证明 ENV 不覆盖 DB。 | Location host、旧/新短链响应、重启后结果、日志。 |
| C9 | API + storage | short-redirect 下头像请求返回 301，Location 指向公开存储/CDN host；short-proxy 下返回 200 和图片字节。两种模式都不应把私有 bucket 签名永久写入业务数据。 | 头像响应、对象键、DB site 引用。 |
| C10 | UI + API + DB | 开启且有效地址保存后，DB enabled=true、地址更新，`getInitData` 的 `feConfigs.mcpServerProxyEndpoint` 为新值，页面探测收到符合 MCP SSE 协议的 endpoint 事件后主动断开；工作台出现 SSE 选项。关闭后隐藏地址表单和 SSE 选项，初始化投影不再包含旧地址；再次开启后原地址可回显。HTTP 发布方式始终可用。 | 页面 Toast/测试结果、`getInitData` 响应、subservice 文档。 |
| C11 | UI + API + DB | 关闭时仅显示启用开关；启用时显示对应 URL，沙箱另显示密码 Token 及一级连通测试按钮。必填为空不得提交；保存刷新正确回显且 Token 为掩码，原有 Agent Sandbox 等兄弟配置保持。有效服务探测成功，错误 Token/协议响应失败，网络错误分类明确且不含凭据；非法 base URL 被拒绝且无配置写入。修改输入后旧探测结果消失，迟到响应不能标记当前输入成功；Plugin/AI Proxy 页面不可访问。 | 截图、脱敏响应、前后 DB 对照、mock 请求与断连记录。 |
