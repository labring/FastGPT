# Zod 参数校验错误 OTEL 上报设计

> 创建日期：2026-05-09
> 状态：第一阶段方案已确认，准备实现
> 关联需求：捕获系统中由 Zod 参数校验失败暴露出的潜在接口 BUG，并通过 OpenTelemetry 日志/链路定位问题接口与字段。

## 1. 背景

FastGPT 后端大量接口使用 Zod schema 对 `req.body`、`req.query`、业务参数和响应结果做校验。当前代码中已经存在两处基础能力：

- `packages/service/common/middle/entry.ts`：`NextEntry/NextAPI` 统一包裹大多数 Next.js API handler，并在 `catch` 中识别 `ZodError` 返回 400。
- `packages/service/common/response/index.ts`：`processError()` 已识别 `ZodError`，并通过 `LogCategories.HTTP.ERROR` 记录 `Zod validation error`。

现状的问题是：

- 日志字段不够结构化，难以按 route、schema、字段路径聚合。
- `NextEntry` 和 `jsonRes/processError` 都可能处理 ZodError，后续增强时容易重复上报。
- 只能粗略知道发生了 ZodError，不容易判断是 `body/query/headers/params` 哪一类输入。
- 默认如果记录完整入参，存在 API Key、token、prompt、聊天内容、文件内容等敏感信息泄露风险。

## 2. 目标

本需求目标是做一个低侵入、可观测、可逐步增强的 Zod 参数校验错误上报机制：

1. 对经过 `NextAPI(...)` 包装的 HTTP API，统一捕获 `ZodError`。
2. 将校验错误以结构化日志形式上报到现有 OTEL logger sink。
3. 在当前 active span 上补充校验错误属性，便于 trace 关联。
4. 默认不记录完整请求参数，只记录字段路径、错误原因和有限的输入摘要。
5. 保持现有 HTTP 响应兼容：Zod 参数错误仍返回 400。
6. 为后续逐步替换裸 `schema.parse(...)` 提供 helper，增强 `schemaName/source` 定位能力。

## 3. 非目标

以下内容不在第一阶段范围内：

- 不一次性重构全仓库所有 `schema.parse(...)` 调用。
- 不修改所有 API 的响应格式。
- 不为每个接口自动推断具体 schema 名称。
- 不默认记录完整请求 body/query。
- 不覆盖未经过 HTTP API 的 worker、cron、队列任务中的所有 ZodError；这些可复用 reporter 后续扩展。
- 不使用 Next.js 根级 `middleware.ts` 捕获 handler 内异常，因为它无法自然捕获 API handler 内部抛出的 ZodError。

## 4. 核心方案

### 4.1 总体架构

新增一个统一 reporter，供 `NextEntry` 和后续 parse helper 调用：

```text
API request
  -> NextAPI / NextEntry
    -> handler
      -> schema.parse(req.body / req.query / ...)
        -> throw ZodError
    -> catch ZodError
      -> reportZodValidationError(...)
        -> logger.error(...)      // OTEL logs
        -> span attributes/status // OTEL trace
      -> jsonRes(400)
```

建议新增文件：

```text
packages/service/common/middle/zodValidationReporter.ts
```

职责：

- 判断和规范化 `ZodError`。
- 提取 `issues`、`paths`、`issueCount`。
- 合并 HTTP 上下文：`requestId/method/url/route/ip/userAgent`。
- 合并 trace 上下文：`traceId/spanId` 已由 `withContext` 注入 logger，上报时无需重复手写，必要时可显式加入。
- 对输入摘要做脱敏和截断。
- 给 span 设置错误属性和状态。

### 4.2 `NextEntry` 集成点

在 `packages/service/common/middle/entry.ts` 的 `catch (error)` 分支中：

```typescript
if (error instanceof ZodError) {
  reportZodValidationError({
    error,
    req,
    span,
    requestId,
    route,
    method,
    url
  });

  return jsonRes(res, {
    code: 400,
    message: 'Data validation error',
    error,
    url: req.url
  });
}
```

注意：

- `reportZodValidationError()` 只负责观测，不负责响应。
- `jsonRes()` 继续负责响应格式和兼容旧逻辑。
- `processError()` 不再对 `ZodError` 打专用日志，避免与 reporter 重复上报。

### 4.3 避免重复日志

当前 `NextEntry` 的 ZodError 分支会调用 `jsonRes(... error ...)`，而 `jsonRes -> processError` 也会记录 `Zod validation error`。

实现时有两个选择：

#### 方案 A：`NextEntry` 负责上报，`processError` 只处理响应

推荐。

- 在 `NextEntry` 中调用 reporter。
- 移除 `processError()` 对 ZodError 的专用日志，只保留响应处理。

优点：

- HTTP 上下文最完整，能拿到 `requestId/route/method/span`。
- 上报逻辑集中在请求中间件层。
- 实现简单，不需要额外的已上报 symbol 标记。

#### 方案 B：`processError` 负责上报

不推荐作为第一选择。

原因：

- `processError()` 当前只拿到 `error/url/defaultCode`，没有完整 req/span/requestId。
- 为了补上下文会把 response 层变复杂。

## 5. 日志字段设计

### 5.1 推荐日志 category

使用现有 HTTP 错误层：

```typescript
getLogger(LogCategories.HTTP.ERROR)
```

日志 message：

```text
HTTP Zod validation error
```

### 5.2 日志 payload

推荐字段：

```typescript
type ZodValidationLogPayload = {
  event: 'http.zod_validation_error';
  requestId: string;
  method: string;
  url: string;
  route: string;
  ip?: string;
  userAgent?: string | string[];
  validationSource?: 'body' | 'query' | 'headers' | 'params' | 'response' | 'internal' | 'unknown';
  schemaName?: string;
  issueCount: number;
  paths: string[];
  issues: Array<{
    path: string;
    code: string;
    message: string;
    expected?: string;
    received?: string;
  }>;
  inputSummary?: {
    topLevelKeys?: string[];
    preview?: string;
    truncated?: boolean;
  };
};
```

### 5.3 Span 属性

在当前 `http.request` span 上补充：

```text
error.type = "ZodError"
validation.error = true
validation.issue_count = <number>
validation.paths = "fieldA,fieldB"
http.response.status_code = 400
```

并设置：

```typescript
span.setStatus({
  code: SpanStatusCode.ERROR,
  message: 'Data validation error'
});
```

第一阶段不调用 `span.recordException(error)`。

原因：

- `recordException(error)` 可能把完整 `error.message` 作为 exception 内容进入 trace。
- Zod 的 `message` 通常包含完整 issues，虽然一般不包含入参值，但第一阶段先保持最小暴露面。
- 详细问题通过结构化日志上报即可，trace 只保留可聚合属性。

## 6. 输入摘要与脱敏策略

默认不记录完整输入。

第一阶段不开放输入内容记录，只使用 `keys` 模式。

后续如需排障增强，可再通过环境变量控制：

```text
ZOD_VALIDATION_LOG_INPUT=keys | preview | full
ZOD_VALIDATION_LOG_PREVIEW_MAX_LENGTH=2000
```

第一阶段确认默认值：

```text
ZOD_VALIDATION_LOG_INPUT=keys
ZOD_VALIDATION_LOG_PREVIEW_MAX_LENGTH=2000
```

### 6.1 `keys` 模式

只记录：

- 顶层 key 列表。

示例：

```json
{
  "topLevelKeys": ["appId", "name", "config"]
}
```

### 6.2 `preview` 模式

在 `keys` 基础上，额外记录脱敏和截断后的字符串预览。

需要复用已有脱敏能力：

```typescript
replaceSensitiveText(...)
```

同时应屏蔽常见敏感字段：

```text
authorization
cookie
token
apiKey
secret
password
accessToken
refreshToken
```

### 6.3 `full` 模式

仅建议本地或临时排障打开。

生产默认不启用；即使启用，也必须经过脱敏和长度截断。

## 7. Parse helper 增强设计

第一阶段全局兜底只能稳定知道 route 和 Zod issue，无法稳定知道 schema 名称和输入来源。

后续可以新增 helper：

```text
packages/service/common/middle/zodParse.ts
```

示例 API：

```typescript
parseApiBody(schema, req, { schemaName: 'CreateAppBodySchema' })
parseApiQuery(schema, req, { schemaName: 'ListDatasetQuerySchema' })
parseApiHeaders(schema, req, { schemaName: 'AuthHeadersSchema' })
parseApiResponse(schema, data, { schemaName: 'McpListResponseSchema' })
```

helper 行为：

- 内部仍调用 `schema.parse(...)`。
- 捕获 ZodError 后附加轻量 metadata，再重新抛出。
- `NextEntry` reporter 读取 metadata，补充 `validationSource/schemaName/inputSummary`。

metadata 不建议污染 ZodError 标准字段，可使用 symbol：

```typescript
const ZodValidationMetaSymbol = Symbol.for('fastgpt.zodValidationMeta');
```

## 8. 覆盖范围

### 8.1 第一阶段覆盖

覆盖所有经过以下包装的接口：

```typescript
export default NextAPI(handler)
```

或：

```typescript
export default NextAPI(middleware, handler)
```

### 8.2 第一阶段不自动覆盖

以下接口需要后续单独梳理：

- 裸 `export default handler` 的 API。
- proxy 类路由，例如部分 `aiproxy/proApi/lafApi/marketplace` 转发入口。
- webhook 类入口。
- SSE 已开始写响应后才发生的 ZodError。
- worker/cron/queue 中的非 HTTP ZodError。

## 9. 响应兼容性

现有行为：

- ZodError 返回 HTTP 400。
- response body 包含 `code/statusText/message/data/zodError`。

第一阶段调整为不再返回 `zodError` 字段，所有环境一致。

新响应策略：

- HTTP status 保持 400。
- response body 保持 `code/statusText/message/data` 基础结构。
- `message` 返回 `Data validation error`。
- 详细 Zod issues 只进入 OTEL 日志，不返回给前端。

## 10. 测试策略

### 10.1 单元测试

建议新增：

```text
packages/service/test/common/middle/zodValidationReporter.test.ts
```

覆盖：

- `ZodError.issues` 被规范化为 `paths/issues/issueCount`。
- 嵌套 path 正确转为字符串，例如 `config.tools.0.id`。
- 输入摘要 `keys` 模式只包含顶层 key，不包含完整值和 value type。
- 附加 metadata 后能输出 `validationSource/schemaName`。

### 10.2 中间件测试

建议新增：

```text
packages/service/test/common/middle/entry-zod-validation.test.ts
```

覆盖：

- handler 抛出 `ZodError` 时返回 HTTP 400。
- reporter 被调用一次。
- `processError` 不重复打第二份 Zod 上报日志。
- span 被设置 400 和 validation 属性。

### 10.3 局部测试命令

开发中运行：

```bash
pnpm test packages/service/test/common/middle/zodValidationReporter.test.ts
pnpm test packages/service/test/common/middle/entry-zod-validation.test.ts
```

最终可按变更范围再跑：

```bash
pnpm test packages/service/test/common/middle
```

## 11. 验收标准

- 任意 `NextAPI` 包装的接口抛出 `ZodError` 时，HTTP 响应仍为 400。
- OTEL logs 中可以按 `event=http.zod_validation_error` 查询。
- 日志能看到 `method/url/route/requestId/issueCount/paths/issues`。
- 默认日志不包含完整请求 body/query 值。
- 同一个 ZodError 不产生两条重复错误日志。
- active span 能看到 `validation.error=true` 和 `validation.issue_count`。
- 单元测试覆盖 reporter 的结构化输出、脱敏、截断和 metadata。

## 12. 开放问题

第一阶段已确认：

1. 默认输入摘要级别使用 `keys`。
2. 不调用 `span.recordException(error)`。
3. 第一阶段只覆盖 `NextAPI` 包装的接口。
4. 所有环境都不向前端返回 `zodError`。

后续仍可讨论：

1. 是否需要给 worker/cron 中的 ZodError 也纳入同一个 reporter？如果需要，建议第二阶段做。
2. 是否要在第二阶段将高频接口逐步替换为 `parseApiBody/parseApiQuery` helper。

## 13. TODO

### Phase 1：设计确认

- [x] 确认默认输入摘要级别：`keys`。
- [x] 确认是否在 span 上 `recordException`：不调用。
- [x] 确认第一阶段只覆盖 `NextAPI` 接口。
- [x] 确认响应体中的 `zodError`：所有环境都不返回。

### Phase 2：Reporter 基础能力

- [x] 新增 `packages/service/common/middle/zodValidationReporter.ts`。
- [x] 实现 Zod issue 规范化：`path/code/message/expected/received`。
- [x] 实现输入摘要：`keys` 模式，只记录顶层 key。
- [x] 实现 span 属性设置。
- [x] 实现 reporter 单元测试。

### Phase 3：接入 `NextEntry`

- [x] 在 `packages/service/common/middle/entry.ts` 的 ZodError 分支调用 reporter。
- [x] 保持 400 响应基础结构兼容，但移除响应体 `zodError` 字段。
- [x] 移除 `processError()` 中的 ZodError 专用日志，避免重复记录。
- [x] 补充 response 行为测试，确认不再返回 `zodError`。
- [x] 补充 `NextEntry` 中间件测试。

### Phase 4：Parse helper 增强

- [ ] 新增 `packages/service/common/middle/zodParse.ts`。
- [ ] 定义 `ZodValidationMetaSymbol` 和 metadata 类型。
- [ ] 实现 `parseApiBody/parseApiQuery/parseApiHeaders/parseApiResponse`。
- [ ] 为 helper 写单元测试。

### Phase 5：试点改造

- [ ] 选择 3-5 个高频接口将 `Schema.parse(req.body/query)` 改为 helper。
- [ ] 优先选择已有 openapi schema 的接口，验证 `schemaName/source` 日志效果。
- [ ] 运行相关局部测试。

### Phase 6：接口覆盖面梳理

- [ ] 统计 `projects/app/src/pages/api` 下未使用 `NextAPI` 的裸 handler。
- [ ] 将可安全纳入 `NextAPI` 的接口列入后续改造清单。
- [ ] 对 proxy/webhook/SSE 类接口标注不适合直接改造的原因。

### Phase 7：最终验证

- [ ] 本地构造一个 Zod 参数错误接口请求，确认返回 400。
- [ ] 确认日志中只有一条 `http.zod_validation_error`。
- [ ] 确认日志中默认不包含完整入参。
- [ ] 确认 trace span 上存在 validation 属性。
- [x] 运行 `pnpm test packages/service/test/common/middle`。

### Deferred：输入内容预览

- [ ] 如后续确实需要更强排障能力，再实现 `preview/full` 模式。
- [ ] `preview/full` 必须包含脱敏和长度截断。
