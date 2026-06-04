# Zod 请求入参错误降噪设计

## 背景

当前 `NextEntry` 捕获到任意 `ZodError` 后都会返回 400，并继续通过 `jsonRes -> processError` 以 error 级别记录 `Zod validation error`。这会把外部调用方传错 `body`、`query`、`params` 的场景当作系统异常上报到 Otel，产生大量噪音。

需求目标是只降级“API 请求入参 schema.parse 失败”的 `ZodError`，其他 `ZodError` 仍视为内部代码或业务数据 bug，保留 error 级别日志和 Otel 告警。

## 判断边界

1. 只处理由 API 边界 helper 显式标记的 `ZodError`。
2. 直接请求入参 parse 必须通过 helper 表达：
   - `parseApiInput({ req, bodySchema: SomeSchema })`
   - `parseApiInput({ req, querySchema: SomeSchema })`
   - `parseApiInput({ req, paramsSchema: SomeSchema })`
3. 只要错误是 `parseApiInput` 抛出的 `ApiRequestInputParseError`，就视为客户端请求入参错误并降级。
4. 不使用 api key header 作为降级条件。入参 parse 通常发生在鉴权前，调用方漏传 api key 时也可能先触发 body/query/params 校验失败；如果继续依赖 header，会把这类客户端错误误上报为系统异常。
5. 没有显式标记的普通 `ZodError` 按内部错误处理，避免把系统 bug 静默降级。

## 使用方法

### API 路由入参 parse

API 路由需要校验 `req.body`、`req.query`、`req.params` 时，使用 `parseApiInput`，不要直接写 `Schema.parse(req.body)`。

```ts
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { body, query } = parseApiInput({
    req,
    bodySchema: CreateSomethingBodySchema,
    querySchema: GetSomethingQuerySchema
  });
}
```

如果 API 入口使用的是 `ApiRequestProps<T>`，用法不变：

```ts
export async function handler(req: ApiRequestProps<SearchDatasetTestBody>) {
  const { body } = parseApiInput({ req, bodySchema: SearchDatasetTestBodySchema });
}
```

`parseApiInput` 会在 Zod 校验失败时抛出 `ApiRequestInputParseError`。该错误会保留：

- `context.inputSource`：失败来源是 `body`、`query` 还是 `params`
- `cause`：原始 `ZodError`，用于响应中的 `zodError` 和日志结构化数据

### 降级条件

`NextEntry` 只在以下条件满足时，将错误视为 API 入参错误：

1. 错误是 `parseApiInput` 抛出的 `ApiRequestInputParseError`

满足时返回 400，不调用 `setSpanError`，`processError` 不调用 logger。否则走内部错误路径：HTTP 500、`setSpanError`、error 日志。

### 不要使用的场景

不要把内部业务数据、数据库记录、模型返回、工具调用参数等 schema 校验改成 `parseApiInput`。这些失败代表系统内部数据不符合预期，应该继续抛普通 `ZodError` 并触发 Otel 告警。

```ts
// 内部业务校验：保留普通 parse，让异常继续按 bug 上报
const runtimeConfig = RuntimeConfigSchema.parse(configFromDb);
```

### 迁移建议

优先迁移会被 SDK、curl、Postman、第三方服务直接调用，并且通过 api key 鉴权的入口，例如：

- `/api/v1/chat/completions`
- `/api/v2/chat/completions`
- `/api/v2/chat/stop`
- 数据集搜索测试等开放 API 入口

纯 Web 控制台内部接口可以暂不迁移；一旦迁移到 `parseApiInput`，该接口的入参错误就会被视为客户端请求错误并返回 400，不再触发错误级 Otel。

## 错误行为示例

### API 入参错误

请求满足以下条件时：

- API 路由使用 `parseApiInput({ req, bodySchema })`
- `bodySchema` 校验失败

处理结果：

- HTTP：返回 400
- Otel：不调用 `setSpanError`，不会按系统异常上报
- 日志：不调用 `logger.info/error`，避免通过 logger 进入 Otel
- Console：不主动打印到 console；调用方可从 400 响应体中的 `zodError` 看到校验详情

响应体示例：

```json
{
  "code": 400,
  "statusText": "error",
  "message": "Data validation error",
  "data": null,
  "zodError": [
    {
      "expected": "string",
      "code": "invalid_type",
      "path": ["appId"],
      "message": "Invalid input: expected string, received undefined"
    }
  ]
}
```

该场景没有 logger 结构化日志。若后续需要排查调用方参数问题，应优先使用客户端收到的 400 响应体，或在专门的非 Otel 采样渠道中另行设计。

### 内部 ZodError

如果错误来自内部业务校验，例如：

```ts
const runtimeConfig = RuntimeConfigSchema.parse(configFromDb);
```

即使请求头携带 api key，也不会降级：

- HTTP：返回 500
- Otel：调用 `setSpanError`，按系统异常上报
- 日志：`logger.error('Zod validation error', { url, data: zodError, error })`

日志结构示例：

```ts
logger.error('Zod validation error', {
  url: '/api/v2/chat/completions',
  data: [
    {
      expected: 'string',
      code: 'invalid_type',
      path: ['model'],
      message: 'Invalid input: expected string, received undefined'
    }
  ],
  error
});
```

## 实现方案

1. 新增 `packages/service/common/zod/requestParseError.ts`：
   - 提供 `parseApiInput({ req, bodySchema, querySchema, paramsSchema })`。
   - helper 内部按 schema 类型调用 `schema.parse(req.body/query/params)`。
   - 捕获 `ZodError` 后抛出 `ApiRequestInputParseError`，并在包装错误上保留原始 `ZodError` 和 `inputSource`。
   - 提供 `getZodParseErrorInputSource(error)` 供统一入口读取。
2. 调整 `NextEntry`：
   - 捕获 `ZodError` 后先调用分类器。
   - 若确认为 API 请求入参错误：返回 400，不调用 `setSpanError`，span 状态保持非 error，仅设置 `http.response.status_code=400`。
   - 若不是请求入参错误：走 500 + `setSpanError`，保留内部 bug 告警语义。
3. 调整 `jsonRes/processError`：
   - 支持传入 `zodParseErrorContext`。
   - 有 context 时不调用 logger，避免通过 logger 进入 Otel。
   - 无 context 的 `ZodError` 仍以 error 级别记录。

## TODO

- [x] 编写需求/设计文档
- [x] 新增 Zod 请求入参错误分类工具
- [x] 接入 `NextEntry` 和 `jsonRes/processError`
- [x] 先迁移外部 API 高频入口的 body parse：v1/v2 chat completions、v2 chat stop、dataset searchTest
- [x] 补充单元测试覆盖 body/query/params、内部 ZodError、日志降级
- [x] 运行局部测试
