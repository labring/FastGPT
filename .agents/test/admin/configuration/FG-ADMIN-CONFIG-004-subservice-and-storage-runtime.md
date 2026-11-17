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
  - "packages/global/common/system/config/registry.ts"
  - "packages/service/common/system/systemInstanceConfig/secrets.ts"
  - "packages/service/common/system/systemInstanceConfig/polling.ts"
  - "projects/app/src/pageComponents/admin/settings/AdminSecretInput.tsx"
  - "projects/app/src/components/common/secret/SecretValueInput.tsx"
  - ".agents/design/common/admin-instance-config-env-boundary.md"
  - "packages/service/env.ts"
  - "packages/service/core/ai/config.ts"
  - "packages/service/thirdProvider/aiproxy/config.ts"
  - "packages/service/core/workflow/dispatch/tools/codeSandbox.ts"
  - "packages/service/thirdProvider/codeSandbox/index.ts"
  - "packages/service/core/ai/sandbox/config.ts"
  - "packages/service/core/ai/sandbox/application/toolCall/index.ts"
  - "packages/service/core/ai/sandbox/application/runtime/prepare.ts"
  - "packages/service/core/ai/sandbox/application/runtime/mirrors.ts"
  - "sdk/sandbox-adapter/src/adapters/opensandbox/adapter.ts"
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
  - "packages/service/common/api/httpError.ts"
  - "packages/service/common/response/index.ts"
  - "packages/service/common/logger/index.ts"
  - "packages/service/core/app/http.ts"
  - "packages/service/core/dataset/apiDataset/feishuDataset/api.ts"
  - "packages/service/core/dataset/apiDataset/yuqueDataset/api.ts"
  - "projects/app/src/pages/api/core/ai/model/config.ts"
  - "projects/app/src/pages/api/core/dataset/apiDataset/list.ts"
  - "projects/app/src/pages/api/core/app/httpTools/runTool.ts"
  - "packages/service/test/common/api/httpError.test.ts"
  - "packages/service/test/common/response/index.errorLogging.test.ts"
  - "packages/service/test/core/dataset/apiDataset/errorLogging.test.ts"
  - "packages/service/test/core/app/http.errorLogging.test.ts"
  - "packages/service/common/file/read/utils.ts"
  - "packages/service/common/system/systemInstanceConfig/frontend.ts"
  - "packages/service/thirdProvider/sangfor/index.ts"
  - "packages/service/support/wallet/usage/controller.ts"
  - "packages/service/core/ai/sandbox/infrastructure/provider/runtimeProfile/opensandbox.ts"
  - "packages/service/core/ai/sandbox/infrastructure/provider/config.ts"
  - "packages/service/core/ai/sandbox/infrastructure/volume/config.ts"
  - "packages/service/core/ai/sandbox/infrastructure/provider/runtimeProfile/sealosdevbox.ts"
  - "packages/service/core/ai/sandbox/application/cron.ts"
  - "packages/service/core/ai/sandbox/application/archive.ts"
  - "packages/service/core/ai/sandbox/application/quota.ts"
  - "packages/service/common/system/constants.ts"
  - "projects/app/src/service/core/dataset/data/dataIndex.ts"
  - "packages/service/core/ai/llm/utils.ts"
  - "packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts"
  - "packages/service/core/dataset/search/defaultRecall/imageCaption.ts"
  - "packages/service/core/dataset/search/utils.ts"
  - "pro/admin/src/service/core/dataset/training/imageUrl.ts"
routes:
  - "GET /api/admin/system/config/get"
  - "POST /api/admin/system/config/update"
  - "POST /api/admin/system/config/probe"
  - "POST /api/v1/chat/completions"
  - "POST /api/core/workflow/debug"
  - "GET /api/common/system/getInitData"
  - "GET /api/system/file/d/{signedAlias}"
  - "GET /api/system/img/{id}"
  - "GET /api/core/ai/model/config"
  - "POST /api/core/dataset/apiDataset/list"
  - "POST /api/core/app/httpTools/runTool"
related:
  - "FG-ADMIN-CONFIG-001"
  - "FG-ADMIN-CONFIG-003"
baseline: "897611e5cdd2b4d5617c5104d0d9bb5b9ebd8a6c"
---

# 子服务与存储策略：AI Proxy、代码沙箱与下载模式

## 用例简介

管理员在页面配置代码沙箱和 MCP SSE 服务后，连通测试、业务入口和实际调用应使用同一组已保存配置；AI Proxy 与 Plugin 继续使用各自 ENV 连接。另验证对象存储下载模式切换后的地址、短链和头像行为。

受控上游失败时，还需保证模型元数据、数据源和 HTTP Tool 的错误日志不携带请求凭据，并保留原有业务错误和日志诊断边界。

## 前置准备

- 环境与版本：社区版或商业版均执行 C1/C4/C10/C11/C12；Agent Sandbox 配置和运行场景在社区版、商业版均可执行，不以 PRO_URL 或 License 限制其配置页；商业模型场景按实际所需部署能力准备；准备可用的 code-sandbox 服务、一个可记录请求头和路径的 AI Proxy mock、一个可响应的 MCP SSE/HTTP mock、MinIO 环境，另有 R2 环境时执行 C7 的 R2 分支。准备一个系统 OpenAI 兼容模型和带代码节点的测试应用 Wc；准备一个 1MB 确定性文件和一张测试头像。当前字段归属：Code Sandbox 的 enabled/url/token、MCP 的 enabled/sseProxyUrl 均由实例配置提供；AI Proxy 的 endpoint/token、Plugin 的 baseUrl/token 由 ENV 提供且无对应管理页/本地开关；Agent Sandbox 的 provider Token 仍在实例配置中。
- 测试数据：记录 `subservice`、`storage` 的 revision 和当前值；记录 `AIPROXY_API_TOKEN`、`PLUGIN_TOKEN` 是否存在（只记录存在性，不记录凭据），记录 AI Proxy mock 请求计数、code-sandbox 请求计数、MinIO/R2 endpoint、当前 `STORAGE_VENDOR`、`FILE_DOWNLOAD_PUBLIC_URL_PREFIX`。准备短链所需的真实文件对象和头像对象，所有对象键带本次 run 前缀。
- 复位约定：每个子场景结束后通过 Admin API 恢复 D0（端点、enabled、MCP 地址和 Agent Sandbox 代理/Provider），恢复本轮修改过的 ENV 并重启；删除测试对象。AI Proxy 缺少 ENV 后的外呼可能失败，不要求模型回答成功，只要求没有发往 mock、没有携带 Token。C8 修改 endpoint 后要恢复并确认 bucket 使用新配置。配置独占串行，全部 scope 的加密快照及本轮对象/模型/App/chat/alias ID 列表留在本轮证据目录，清理不触及其他数据。
- 快照与恢复遵循 FG-ADMIN-CONFIG-001 的 BSON 类型保留、公共配置锁、精确 CAS 和长窗口 License metadata 例外；短请求拒绝仍严格零写，不以普通 JSON 基线恢复文档，不回滚正常 License 验签。
- 验证能力：浏览器可操作子服务页/核心配置页并读取 Toast；fake AI Proxy、fake code-sandbox 和 MCP mock 记录请求；Mongo 只读查询配置；对象存储可查询对象；日志按 requestId/时间窗读取 `getAiProxyBaseUrl`、`S3` 等 callsite。不得在文档保存 mock 的 Authorization 原值。
- 条件范围：C7 以有效 D0 为基线，本次提交造成的非法组合应返回 HTTP/业务 code 400 且零写入；库中原有坏数据引发的内部错误不属于这些变体。若环境无法把系统模型外呼固定到 mock（例如出口代理不可控），C2/C3 记录阻塞；无可用 provider 或 R2 时仅记录相应变体未执行，不冒充真实服务通过。
- 执行入口：本例尚无完整 Node/Playwright 自动化映射，由 AI 通过页面、真实 HTTP、协议 mock 和对象存储执行；无 provider、R2、可控外呼或 SDK 协议 mock 时，只阻塞相应变体。C4 的配置校验与真实 provider 运行分别记录，不能将前者冒充后者。
- C12 夹具：使用本轮明确 ID 的 App/chat和可确定触发工具调用的模型，经真实工作流与 SDK读取、写入和检查镜像文件。协议 mock 可覆盖内存文件规则，但必须与真实 provider运行分别报告；真实 HOME 分支使用已有可用镜像，APT 分支需具备 `/etc` 写权限的本轮独立 root 镜像/沙箱，不能修改共享基础镜像或提升 provider 安全参数。预置部分原有 npm、pip/uv文件及 Debian apt源，另有目标文件不存在；APT分别准备原文件、自建未编辑、自建后用户编辑三种初态，每分支的 A/B/清空复用同一 App/chat。来源标记为运行目录中按目标路径 hash 定位的 `.json`，原文件字节存于独立 `.backup`，不能假设备份内嵌在 JSON。保留其他发行版源及无关 `.copy` 文件。只验证文件消费，不运行 apt-get/包安装或向镜像站外发；实际 provider产生的本轮容器、卷、归档及临时镜像须按明确 ID清理。缺少 root镜像只阻塞真实 APT分支，不用 mock或 HOME成功代替。
- C14 夹具：复用 C2/C3 的模型元数据连接和 FG-ADMIN-CONFIG-003/C7 的本轮 Feishu/Yuque数据源，另准备仅访问受控地址的 HTTP Tool请求；也可独立创建等价的本轮夹具。四类请求分别携带可区分的合成凭据，受控服务返回 HTTP 503及含独立回声标记的错误体，记录确实收到请求但不记录凭据。所有外呼须经过本轮受控服务或禁止转发代理，不连接真实供应商。记录真实 App PID、requestId/资源 ID、时间窗及日志文件 offset；可观测真实 console，OTel仅在实际启用且可查询时单独验收，未启用不冒称已覆盖。注入后的原异常/请求对象只在内存验证，报告只留标签、状态、计数及敏感内容缺失布尔值。工作流 HTTP 节点另用实际 dispatcher 和回环 HTTP/HTTPS 复核：相同请求跨快照切换响应上限与证书策略；日志凭据边界使用实际 console/OTel sink。此协议测试不冒充 Dev API、生产私网可达性或厂商可用性。

- C15/C16 为隔离消费者/原生协议变体，不覆盖前述真实 Dev API/provider 运行的证明义务。使用完整进程私有快照，真实生产分派、客户端/SDK和原生回环 HTTP；供应商固定域名仅在测试 transport 映射至 owned receiver，拒绝任何未声明目标，绝不转发真实供应商。PDF 计费用回调结果不落真实账，模型 payload 仅在受控文件物化/模型传输边界检查。C16 的 timer lock、repository/provider/count 只在隔离进程受控，不能扫描/停止/归档共享沙箱；真实 Pod四个变体有单独开关，缺少环境时单列未执行，不因 HTTP 成功自动通过。
- 增量清理：finally 恢复私有 snapshot/adapter/环境 mock，关闭 receiver、HTTP agent和计时器，释放 SDK连接；受控 volume-manager 只确认协议，不创建真实 PVC。若选择真实 Pod/PVC变体，另需明确授权的本轮资源标签/ID、集群和按清单删除能力，否则保持该变体阻塞。
## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；code-sandbox 可用，D0 | 在 Code Sandbox 页开启 enabled、保存有效地址和 Token；运行 Wc 的代码节点并读取输出。再关闭 enabled 保存，重复运行同一节点；记录 code-sandbox 请求计数和节点错误。 |
| C2 | 基础；AI Proxy mock 可用 | 确认没有 AI Proxy 管理页/开关，设置 ENV `AIPROXY_API_ENDPOINT`（末尾带 `/`）及 `AIPROXY_API_TOKEN`（前后可带空格）并重启；用系统模型发起一次 `/api/v1/chat/completions`。记录 mock 收到的 path、Authorization 和请求次数；打开 Admin GET 和只读 DB，确认实例配置中没有 token 字段。 |
| C3 | 异常/安全；承接 C2 | 分别缺少 endpoint 或 Token ENV，重启后再次发起同一模型请求。等待一个完整请求周期，记录 mock 请求计数、响应/错误和服务日志；若外呼可达，记录实际回落目标。 |
| C4 | 边界；`/admin/subservice/agent-sandbox` 页 D0 | 对 `sealosdevbox`、`opensandbox` 分别验证：4a：准备完整代理（合法 wsUrl/previewUrl/至少 32 字符的合成 secret），provider baseUrl 留空保存；另逐一省略代理字段或设 secret<32 字符。4b：填完整代理与有效 provider baseUrl 保存（需要凭据时提供本轮合成值或已配置状态）；只改非敏感项再次保存并确认未改凭据保持。4c：provider 设 `none` 保存。4b 后重启节点检查 sandbox 路由/能力；无实际 provider 时仅配置/校验变体可执行，运行变体阻塞。 |
| C5 | 基础；storage=short-proxy | 上传测试文件并获取短链，使用未登录/普通客户端请求短链；记录 HTTP status、Content-Type、响应体哈希和 Location。 |
| C6 | 基础；MinIO + 非空 externalEndpoint | 切换 `storage.downloadMode=short-redirect`，保存合法 `externalEndpoint`；请求同一短链并跟随 302，记录 Location、`Cache-Control`、`X-Amz-Expires`/等价 TTL 和下载内容。 |
| C7 | 异常；按 vendor 选择 | 7a：MinIO 设 short-redirect、externalEndpoint 为空；7b：配置 cdnEndpoint 但 externalEndpoint 为空；7c：R2 配置 cdnEndpoint；7d：MinIO 合法 short-redirect+externalEndpoint。每次保存后查 storage revision。 |
| C8 | 边界；承接 C6 | 把 externalEndpoint 从 A 改到 B（不重启），保存后请求旧短链和新短链；再把 `STORAGE_DOWNLOAD_URL_MODE` ENV 改成 short-proxy 并重启节点，重复请求。记录 Location host 和 S3 bucket 行为。 |
| C9 | 边界；头像对象已上传 | 在 short-redirect 与 short-proxy 下分别请求同一头像 URL；记录 301/200、Location host 和字节内容。 |
| C10 | 基础；MCP mock 可用，D0 | 打开 `/admin/subservice/mcp`，启用开关、把 `subservice.mcp.sseProxyUrl` 设为 MCP mock 地址并保存；点击页面连通测试并读取初始化配置及工作台 SSE 发布选项。再关闭开关保存并重复读取，最后重新开启检查地址是否保留。 |
| C11 | 页面/异常；D0 | 核对子服务菜单无 Plugin/AI Proxy，MCP 名称为“MCP SSE 服务”。分别关闭 Code Sandbox/MCP 后检查隐藏字段；开启后尝试空字段保存，再填写合法 URL/Token 保存并刷新；探测有效服务、错误 Token、普通 HTTP 冒充服务和不可达地址。提交 query/hash/账号密码或非 HTTP(S) 的 base URL，观察拒绝；探测中修改 URL/Token，旧结果不得覆盖当前输入。 |
| C12 | 边界；本轮 App、SDK与具备文件权限的 OpenSandbox夹具 | 依次通过真实配置 API 设置 `agentSandbox.common.npmRegistry/pypiIndexUrl/aptMirror` 为受控值 A、B、空值；每次等待配置刷新，再调用含 `useAgentSandbox=true` ToolCall节点的 workflow debug。经 SDK检查目标文件、独立 `.backup`、`.json`来源标记及运行态 hash；代表性 HOME文件覆盖原文件恢复与自建文件清理，真实 APT按原文件/自建未编辑/自建用户编辑三分支各执行 A→B→清空。用户编辑只在 B成功后写入本轮自建文件。结束后按本轮 ID清理 App、会话、沙箱、卷、归档和临时镜像并恢复配置；协议 mock结果单列。 |
| C13 | 边界；独立知识库数据块引用本轮对象 | 设置 `storage.fileUrlExpiredDays=0.5`，经真实集合导出生成图片短链；再设为 `1.5`，对同一数据块重复导出，解析短链过期时刻并下载校验对象。恢复配置并清理本轮资源。 |
| C14 | 异常/安全；受控上游与本轮资源 | 依次通过真实 `GET /api/core/ai/model/config?channelType=system`、两种数据源的 `POST /api/core/dataset/apiDataset/list`、`POST /api/core/app/httpTools/runTool` 触发同类 HTTP 503失败；分别记录实际消费请求、HTTP/业务响应及本轮增量日志，在内存扫描合成凭据、URL/query标记和错误体回声是否泄漏。对可用 OTel通道核对同一日志事件；现有 helper/HTTP Tool单测另核对 direct-only、非法 response.status及 getter边界，不能将其当作真实 HTTP入口证据。另以真实工作流 HTTP dispatcher 向受控失败服务发送合成鉴权及 query，核对错误输出保持、console/OTel均不输出这些内容；分别验证节点与通用客户端的响应上限、TLS策略作用范围及生产模式私网策略。恢复连接/ENV并删除本轮资源。 |

| C15 | 边界；确定性文档与受控 provider 协议，各变体独立 | 在真实 readFileContent 分派依次选 customPdf/somark/textin/doc2x/sangfor，对各自 URL/凭据 A/B核对原生 HTTP/multipart、结果页数及当前单价；none和 Sangfor 未命中扩展名回到系统 parser 边界，选中 Sangfor 的慢响应按专用 timeout中止。另以真实模型消息转换切换 multipleDataToBase64，检查同一图像/视频输入输出 URL 或 data URL及顺序，不调用真实模型。 |
| C16 | 边界；生产 sandbox adapter/SDK与回环 Lifecycle/VolumeManager | 切换 common CPU/内存和 storageSizeGi，实际 create/ensure/delete捕获请求；以 CPU-only、memory-only、组合 factor、显式 request、最小取整与 Docker 对照检查 requests/limits。useServerProxy false/true分别实际创建 adapter并观察 SDK endpoint GET参数。用相同注册 suspend callback、archive入口和真实 quota逻辑切换 suspendMinutes/archiveInactiveDays/maxEditDebug/maxPerTeam；quota覆盖零与nullable，不扫描真实共享实例。 |
## 预期结果

公共断言：Code Sandbox 和 MCP SSE 的连接及开关保存后只由实例配置决定；Agent Sandbox 同属 all 字段，社区版可用。沙箱 Token 与代理 secret 的 GET/保存响应在原字段位置只返回 `{isSecret:true}` 标记，未配置返回空串，不返回密钥路径列表；省略或精确标记保留、字符串替换（`******` 也是真实新凭据）、空串清空，非空值以 `{secret: cipher}` 加密存储，日志/证据不得暴露密钥。AI Proxy 和 Plugin 连接仍由 ENV 提供，不写入 `system_instance_configs`。缺少 AI Proxy endpoint 或 Token 时，不访问代理 mock，回落外呼也不携带代理 Token。S3 下载模式、externalEndpoint、cdnEndpoint 以 DB 为准，重定向预签名 TTL 固定最多 30 秒，不再提供 redirectTtlSeconds 配置字段，环境变量只在首次迁移时 seed；配置保存成功不得被 S3 清理、头像生命周期或后台刷新失败误报为失败。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/UI + mock + DB | enabled=true 且地址、Token 完整有效时，代码节点返回 mock/沙箱的实际输出，mock 收到对应请求；enabled=false 时节点返回 `Code sandbox service is not configured or disabled`，mock 计数不增加，DB `subservice.codeSandbox.enabled=false`。恢复后再次请求立即按新值执行，无需重启。 | 节点响应、mock 计数、`system_instance_configs.subservice`。 |
| C2 | API + mock + DB | mock 只收到 `${endpoint}/v1/...`，不能出现双斜杠；Authorization 为 `AIPROXY_API_TOKEN` 去首尾空白后的值；Admin GET 不返回 token，DB 不存在 `subservice.aiProxy` 配置分支，页面无 AI Proxy 开关。 | mock 请求记录、GET 响应、DB 文档。 |
| C3 | API + mock + log | 缺少任一 ENV 后 mock 请求计数不增加，任何外呼/错误日志都不出现代理 Token；若请求回落到 `https://api.openai.com/v1`，这是允许的行为，但不要求网络成功。不得因为“模型请求失败”把配置安全断言判为通过或失败。 | mock 计数、响应/错误、日志中的 baseUrl 与脱敏后的 Authorization。 |
| C4 | UI + DB | 空 provider baseUrl、启用时不完整代理或不足 32 字符的非空代理 secret 均被拒绝，无成功 Toast、revision 不变；完整代理和合法 provider 配置保存成功；省略敏感字段保留原加密值；合法既有代理下切 `none` 成功。社区版与商业版均可进入页面并保存 all 字段，重启后 provider 读取为 DB 值；没有真实 provider 时运行变体阻塞，不能把“配置已保存”当成沙箱可运行。 | 保存响应/Toast、DB、重启后 sandbox 能力/日志。 |
| C5 | API + storage | 短链返回 HTTP 200，无 `Location`，正文哈希与上传文件一致；响应由 FastGPT 代理，不把对象存储内部地址暴露给客户端。 | 短链响应、对象存储对象、哈希。 |
| C6 | API + storage | 短链返回 302，`Cache-Control: no-store`，Location 的 host 为 externalEndpoint（配置 CDN 时为 CDN host），带预签名参数；TTL 不超过固定 30 秒且不超过短链本身剩余有效期（解析签发时间和到期参数，允许 SDK 秒级取整）；跟随 Location 下载的字节与原文一致。 | 两次 HTTP 响应、Location 解析、下载哈希。 |
| C7 | API + DB | 7a/7b/7c 均返回 HTTP/业务 code 400，storage revision 不变；7d 成功并保存 mode/endpoint。 | update 响应、storage 文档。 |
| C8 | API + storage + DB | 改 endpoint 后无需重启，新短链和旧短链都按当前 DB endpoint 生成 Location；S3 bucket/头像单例已重建，不继续使用旧 host。把 ENV 改为 short-proxy 并重启后仍返回 302，证明 ENV 不覆盖 DB。 | Location host、旧/新短链响应、重启后结果、日志。 |
| C9 | API + storage | short-redirect 下头像请求返回 301，Location 指向公开存储/CDN host；short-proxy 下返回 200 和图片字节。两种模式都不应把私有 bucket 签名永久写入业务数据。 | 头像响应、对象键、DB site 引用。 |
| C10 | UI + API + DB | 开启且有效地址保存后，DB enabled=true、地址更新，`getInitData` 的 `feConfigs.mcpServerProxyEndpoint` 为新值，页面探测收到符合 MCP SSE 协议的 endpoint 事件后主动断开；工作台出现 SSE 选项。关闭后隐藏地址表单和 SSE 选项，初始化投影不再包含旧地址；再次开启后原地址可回显。HTTP 发布方式始终可用。 | 页面 Toast/测试结果、`getInitData` 响应、subservice 文档。 |
| C11 | UI + API + DB | 关闭时仅显示启用开关；启用时显示对应 URL，沙箱另显示凭据配置状态/编辑控件及一级连通测试按钮。必填为空不得提交；保存刷新正确回显且 Token 仅显示“已配置”，省略 Token 的探测通过 useStoredToken 使用服务端已保存凭据，不回传凭据值，原有 Agent Sandbox 等兄弟配置保持。有效服务探测成功，错误 Token/协议响应失败，网络错误分类明确且不含凭据；非法 base URL 被拒绝且无配置写入。修改输入后旧探测结果消失，迟到响应不能标记当前输入成功；Plugin/AI Proxy 页面不可访问。 | 截图、脱敏响应、前后 DB 对照、mock 请求与断连记录。 |
| C12 | API + DB + provider/SDK | A、B经真实 SDK写入对应镜像地址，`.json` 的 path/origin/hashes/pending状态及独立 `.backup`字节符合实际文件来源；清空后原文件逐字节恢复，自建未编辑文件删除，自建后用户编辑文件保留，已完成的来源标记/备份清理。真实 APT三分支均核对运行态 hash及其他发行版源不变，无关 `.copy`文件不受影响；不能把 HOME、协议 mock或仅保存配置称作真实 APT通过。其他管理域/辅助 scope业务 BSON与非本轮资源不变，License metadata按公共例外记录。配置恢复且本轮 App/沙箱/卷/归档/临时镜像按清单清零，基础镜像不变；不宣称包安装/镜像站网络已验证。 | 配置 revision、真实 workflow/SDK响应、runtime UID与 provider安全参数对照、文件/backup/marker逐项布尔比较、Mongo/S3及容器卷归档清单；真实 provider与内存 mock分别列证。 |
| C13 | API + DB + storage | 导出的签名有效期以 12/36 小时为输入，按现有 SDK 规则分别向上取整到 1 小时/24 小时分桶；过期时刻须与请求起止时间计算区间一致，不得立即过期；两次均可实际下载且哈希一致，alias 指向本轮对象，配置恢复。 | 导出响应、签名过期值、alias 数据库记录和下载哈希。 |
| C14 | API + log + controlled HTTP | 四类真实入口均到达受控失败，日志不得输出原 error/cause/headers/request/response/config、带凭据的 URL/query或上游 message/msg回声。API Axios分支、Feishu、Yuque均为 error级固定 `HttpRequestError` / `HTTP request failed`摘要；HTTP Tool保持 warn级 `HttpToolRequestError` / `HTTP tool request failed`；工作流 HTTP 节点保持原事件标签，改用 `HttpRequestError` / `HTTP request failed`安全摘要，只额外记录可信的证书开关，不记录 URL或原异常；用户配置错误保持 info及 `otel:false`降噪，内部输出处理错误仍为 warn并可导出。诊断仅允许共享 11种网络 code及 100–599整数 status；前者组仅在 response.status缺省时回退直接 status，HTTP Tool只用 response.status，非法非空响应状态不得被直接状态替代。未知值/getter故障返回空诊断，不输出原异常；这些不可从真实HTTP稳定构造的边界由对应单测独立留证。业务响应/数据源拒绝分类保持原规则，HTTP Tool仍返回原 `formatHttpError`展示文本，不把安全日志摘要替换业务结果。四个入口、console/OTel、单测各自记录实际覆盖；缺少必要入口/日志时仅对应变体阻塞，不凭无日志判安全。 | requestId/资源ID与时间窗、上游503计数、脱敏响应及原业务语义对照、真实console/可用OTel的固定标签/级别/code/status、凭据/URL/回声缺失布尔值、边界单测原输出和清理证据；禁止粘贴原异常或敏感日志。 |
| C15 | native provider HTTP + production payload boundary | 五 provider 只发送各自当前凭据，返回对应确定文本，实际页数×当前 price正确；更改未选 provider 不抢占。none/未命中扩展不外呼，Sangfor 超时中止且不静默改走系统解析。multipleDataToBase64 disabled保留URL，enabled生成正确类型的base64 payload并保持多模态消息顺序；其文件/模型 transport受控层独立说明。 | 回环请求 method/path、凭据匹配布尔值、实际解析结果/页数/usage回调、慢源关闭、消息payload断言；无真实厂商解析、模型推理或账单落账声明，凭据不写证据。 |
| C16 | adapter + source SDK native HTTP + lifecycle/admission unit | 下一次实际 create使用当前 common CPU/内存；overcommit改变 requests且保留 limits，覆盖/舍入和 Docker省略分支正确。ensure包含当前2/5Gi等测试值，DELETE使用精确 owned claim；endpoint请求 `use_server_proxy` 仅等于当次false/true。相同 callback/归档入口重新计算当前分钟/天 cutoff；quota在团队count触限拒绝、增大后允许、null跳过团队count而全局0仍拒绝。 | 实际 HTTP create/endpoint/ensure/delete与精确 payload/query、cutoff和准入断言、连接清理；生命周期repository/count/providers受控须注明。真实 Pod调度、PVC创建和共享 cron未执行时单列，不以这些协议/逻辑结果替代，Sealos阻塞仍按C4独立保留。 |
