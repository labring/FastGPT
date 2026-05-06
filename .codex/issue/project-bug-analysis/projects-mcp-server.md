# projects/mcp_server 潜在 Bug 分析

## 范围

分析范围包括 `projects/mcp_server` 的 Express + MCP SSE 服务、FastGPT API 调用、连接管理、输入校验、日志和启动配置。

## Findings

### 高：SSE 连接建立前不校验 key，无效 key 可占用连接资源

- 位置：`projects/mcp_server/src/index.ts:18`
- 路由：`GET /:key/sse`

#### 问题

SSE 连接建立时，服务直接创建 `SSEServerTransport` 和 MCP `Server`，并写入 `transportMap`：

```ts
const transport = new SSEServerTransport(`/${key}/messages`, res);
transportMap[transport.sessionId] = transport;
```

此时没有校验 `key` 是否有效。只有客户端后续请求 tools/list 时才会调用 FastGPT。

#### 触发场景

攻击者持续请求 `/random/sse` 并保持连接，但不发送 `tools/list`。

#### 影响

无效 key 也会占用长连接、内存、transport 和 server 实例，形成低成本 DoS。

#### 建议修复

- SSE 连接前先校验 key，或预取 tool list。
- 无效 key 立即返回 401/404。
- 增加全局和按 key 连接数限制、空闲超时和速率限制。

### 高：工具调用参数未按 inputSchema 做服务端校验

- 位置：`projects/mcp_server/src/index.ts:82`
- handler：`CallToolRequestSchema`

#### 问题

工具调用时直接将 `request.params.arguments` 透传给 FastGPT 后端：

```ts
handleToolCall(request.params.name, request.params.arguments ?? {})
```

MCP 的 `inputSchema` 只是告诉客户端如何构造参数，不能作为可信边界。服务端没有按当前 tool 的 schema 验证参数类型、必填字段、额外字段和大小。

#### 触发场景

客户端绕过 schema，传入缺失 `question`、错误类型的 `fileUrlList`、超大对象、深层对象或异常字段。

#### 影响

后端工作流可能进入异常路径、报错或被大输入拖垮资源。

#### 建议修复

- 在 `callTool` 前按当前 tool 的 `inputSchema` 使用 Ajv 或 Zod 校验。
- 限制请求 body 大小、字段数量、字符串长度和对象深度。
- 校验失败返回 `isError: true` 和可读错误内容。

### 高：工具列表请求把 MCP key 放在 query，app 请求日志会记录访问密钥

- 位置：
  - `projects/mcp_server/src/api/fastgpt.ts:4`
  - `projects/mcp_server/src/api/request.ts:109`
  - `packages/service/common/middle/entry.ts:81`

#### 问题

独立 MCP server 获取工具列表时使用 GET query 传 key：

```ts
GET<Tool[]>('/support/mcp/server/toolList', { key });
```

request helper 会把它拼到 URL query。app 侧通用请求日志记录完整 `req.url`：

```ts
requestLogger.info(`[${method}] ${url}`, { url, ... });
```

MCP key 是可调用工具的访问密钥，不应进入普通访问日志。

#### 触发场景

MCP Client 建立连接并发送 `tools/list`，app 侧 HTTP.REQUEST 日志中出现 `/support/mcp/server/toolList?key=...`。

#### 影响

日志系统、错误平台或运维人员可看到完整 MCP key，扩大密钥泄露面。

#### 建议修复

- 改为 header 或 POST body 传 MCP key。
- 日志层统一脱敏 query/path 中的 `key`、`token`、`secret` 等字段。
- 对 `/support/mcp/server/toolList` 增加专项脱敏测试。

### 高：工具调用失败时错误文本放在非标准 message 字段

- 位置：`projects/mcp_server/src/index.ts:68`

#### 问题

独立 MCP server 在工具调用失败时返回：

```ts
return {
  message: (error as Error).message,
  content: [],
  isError: true
};
```

`message` 不是标准 `CallToolResult` content block。客户端可能只看到 `isError: true` 和空 `content`，看不到具体错误原因。

#### 触发场景

调用不存在的 tool、参数缺失或 FastGPT 后端返回错误。

#### 影响

MCP Client 难以展示或处理错误原因，排障体验差，也会影响自动修正参数的客户端。

#### 建议修复

返回标准 content：

```ts
content: [{ type: 'text', text: getErrText(error) }],
isError: true
```

### 中：未知 sessionId 的 messages 请求不返回响应

- 位置：`projects/mcp_server/src/index.ts:90`
- 路由：`POST /:key/messages`

#### 问题

`sessionId` 缺失或查不到 transport 时没有任何响应：

```ts
const transport = transportMap[sessionId];
if (transport) {
  transport.handlePostMessage(req, res);
}
```

#### 触发场景

SSE 已断开后客户端继续 POST，或恶意请求不带/伪造 `sessionId`。

#### 影响

客户端请求会挂起直到超时，服务端连接资源被占用，也会增加排障难度。

#### 建议修复

- 缺少 `sessionId` 返回 400。
- 找不到 transport 返回 404 或 410。
- `handlePostMessage` 使用 `await` 并捕获异常。

### 中：messages 路由不校验 URL key 与 session 所属 key 是否一致

- 位置：`projects/mcp_server/src/index.ts:90`

#### 问题

`POST /:key/messages` 只用 `sessionId` 查 `transportMap`，不校验 path 中的 `key` 是否等于创建 SSE session 时的 key。session 存在时，请求发到任意 `/:key/messages?sessionId=...` 都会进入原 transport。

#### 触发场景

先打开 `/keyA/sse` 拿到 sessionId，再向 `/keyB/messages?sessionId=该值` 发送 `tools/call`。调用实际仍按 keyA 的闭包执行。

#### 影响

虽然不直接越权到 keyB，但 URL 语义和鉴权边界混乱，日志、审计和客户端路由都可能误判请求属于 keyB。

#### 建议修复

- `transportMap` 保存 `{ key, transport }`。
- messages 路由校验 `req.params.key === stored.key`，不匹配返回 404/403。
- 使用 `Map` 代替普通对象保存 transport，避免特殊 key 行为。

### 中：未完成 MCP initialize 也能处理 tools/list 和 tools/call

- 位置：
  - `projects/mcp_server/src/index.ts:53`
  - `projects/mcp_server/src/index.ts:82`

#### 问题

SSE 连接建立后，服务没有显式跟踪 MCP initialize 生命周期。客户端可以不发送 initialize，直接在 messages 路由发送 `tools/list` 或 `tools/call`。

#### 触发场景

建立 SSE 后直接 POST：

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

有效 key 下可返回工具列表。

#### 影响

协议状态机不完整，可能影响客户端兼容性，也减少了早期拒绝非法连接的机会。

#### 建议修复

- 跟踪 session 的 initialized 状态。
- 未 initialize 的非生命周期请求返回 MCP protocol error。
- 添加 MCP 生命周期顺序测试。

### 中：工具调用参数完整写入 info 日志，可能泄露敏感数据

- 位置：`projects/mcp_server/src/index.ts:62`

#### 问题

工具调用时完整记录参数：

```ts
logger.info(`Call tool: ${name} with args: ${JSON.stringify(args)}`);
```

tool 参数可能包含用户隐私、token、文件 URL、业务密钥或内部数据。

#### 触发场景

MCP Client 调用需要鉴权信息、外部文件地址、客户数据或业务字段的工具。

#### 影响

敏感信息进入日志系统，扩大泄露面。即使 logger 有部分脱敏规则，也难覆盖任意 tool 参数结构。

#### 建议修复

- 默认只记录 toolName、字段名、参数大小、requestId。
- 对值做截断和敏感字段脱敏。
- 需要完整参数时使用 debug 级别并受配置开关控制。

### 中：FASTGPT_ENDPOINT 缺失或非法时服务仍启动

- 位置：`projects/mcp_server/src/api/request.ts:89`
- 启动入口：`projects/mcp_server/src/index.ts:101`

#### 问题

FastGPT API base URL 直接使用环境变量拼接：

```ts
const baseURL = `${process.env.FASTGPT_ENDPOINT}/api`;
```

启动阶段没有校验 `FASTGPT_ENDPOINT` 是否存在或是否是合法 URL。配置缺失时服务仍可启动，直到请求工具列表或调用工具时才访问 `undefined/api...`。

#### 触发场景

部署漏配 `FASTGPT_ENDPOINT`，或配置为非法 URL。

#### 影响

服务表面上启动成功，但 MCP 全部请求失败，故障发现滞后。

#### 建议修复

- 在 `bootstrap/init` 阶段校验必填 env 和 URL 格式。
- 配置错误时 fail fast，并输出明确错误。
- 增加启动配置单元测试。

### 中：.env.local 加载顺序无法覆盖 .env，本地覆盖配置会被静默忽略

- 位置：
  - `projects/mcp_server/src/init.ts:4`
  - `projects/mcp_server/src/init.ts:5`

#### 问题

初始化时先加载 `.env`，再加载 `.env.local`：

```ts
dotenv.config();
dotenv.config({ path: '.env.local' });
```

但 `dotenv.config()` 默认不会覆盖已存在的环境变量。因此当两个文件配置同名变量时，`.env.local` 中的值不会生效。

#### 触发场景

本地同时存在 `.env` 和 `.env.local`，并在两者中配置同名变量，例如 `FASTGPT_ENDPOINT`。

#### 影响

本地覆盖配置被静默忽略，MCP server 可能连接到错误的 FastGPT 地址或使用错误 key。该问题会和“FASTGPT_ENDPOINT 缺失或非法时服务仍启动”叠加，让排查更困难。

#### 建议修复

- 先加载 `.env.local` 再加载 `.env`，或第二次加载 `.env.local` 时使用 `override: true`。
- 启动日志打印生效配置来源，但不要打印敏感值。
- 增加 `.env.local` 覆盖 `.env` 的单元测试。
