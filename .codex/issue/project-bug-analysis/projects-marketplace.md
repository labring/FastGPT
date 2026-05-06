# projects/marketplace 潜在 Bug 分析

## 范围

分析范围包括 `projects/marketplace` 的 NextJS API、后台刷新、工具列表/详情/下载 URL、下载计数、Mongo 初始化和日志。

## Findings

### 高：后台刷新接口在 AUTH_TOKEN 为空时完全公开

- 位置：
  - `projects/marketplace/src/service/auth.ts:1`
  - `projects/marketplace/src/pages/api/admin/refresh.ts:14`

#### 问题

`AUTH_TOKEN` 默认为空，刷新接口只有在 `!!AUTH_TOKEN` 时才校验授权：

```ts
if (!!AUTH_TOKEN && req.headers['authorization'] !== AUTH_TOKEN) {
  res.status(401);
  return Promise.reject('Unauthorized');
}
```

未配置 token 时，任何人都可以访问 `/api/admin/refresh` 触发缓存刷新。

#### 触发场景

marketplace 部署时漏配 `AUTH_TOKEN`，外部请求 `/api/admin/refresh`。

#### 影响

公开接口可触发后台刷新和远程数据拉取，造成缓存抖动、上游压力和管理接口暴露。

#### 建议修复

- 生产环境启动时强制要求 `AUTH_TOKEN` 非空。
- 使用标准 `Authorization: Bearer <token>`。
- 仅允许 POST，并增加频率限制。

### 中：工具不存在时 detail 接口没有中断，仍返回合成下载地址

- 位置：`projects/marketplace/src/pages/api/tool/detail.ts:33`

#### 问题

工具不存在时只设置了 `res.status(404)`，但没有 `return` 或 `throw`：

```ts
if (tools.length < 1) {
  res.status(404);
  Promise.reject('tool not found');
}
```

函数会继续返回 `tools: []`、`downloadUrl: getPkgdownloadURL(toolId)`。

#### 触发场景

请求 `/api/tool/detail?toolId=not-exist`。

#### 影响

客户端收到语义错误的响应，可能展示不存在工具的下载入口，也会给探测 S3 路径留下空间。

#### 建议修复

- 不存在时 `return res.status(404).json(...)` 或直接 `throw`。
- 不要为不存在的 toolId 生成 readme/download URL。
- 增加不存在工具的接口测试。

### 中：下载 URL 接口未校验 toolId 存在和格式

- 位置：`projects/marketplace/src/pages/api/tool/getDownloadUrl.ts:25`

#### 问题

GET 分支只要传了 `toolId`，最终就返回：

```ts
getPkgdownloadURL(toolId)
```

即使该工具不存在，也会用用户输入拼出 `${S3_PREFIX}/pkgs/${toolId}.pkg`。`toolId` 也没有格式白名单。

#### 触发场景

请求 `/api/tool/getDownloadUrl?toolId=../../x` 或任意不存在 ID。

#### 影响

公开接口可被用于构造非真实工具的 S3 路径样式 URL，客户端行为不稳定，也可能污染外部下载流程。

#### 建议修复

- 必须先在 `getToolList()` 中精确匹配 toolId。
- 不存在返回 404。
- 对 toolId 做白名单格式校验或安全编码。

### 中：公开下载接口无速率限制，下载计数缓存可被刷量和撑大

- 位置：
  - `projects/marketplace/src/pages/api/tool/getDownloadUrl.ts:28`
  - `projects/marketplace/src/service/downloadCount/index.ts:104`

#### 问题

每次请求真实 toolId 都会向全局数组追加一条记录，10 秒后批量写库：

```ts
global.__downloadCache!.push({ toolId, type, hour });
```

没有 IP/工具维度限流，也没有缓存容量上限。

#### 触发场景

对某个真实 toolId 并发或循环请求下载 URL。

#### 影响

下载量可被轻易刷高，并造成内存增长和周期性 bulkWrite 压力。

#### 建议修复

- 增加 IP、toolId、时间窗口维度限流。
- 在内存中按 `toolId-hour` 聚合计数，而不是每次请求 push 一条。
- 增加缓存容量上限和降级策略。

### 中：Mongo 初始化失败日志会输出完整 MONGODB_URI

- 位置：
  - `projects/marketplace/src/instrumentation.ts:28`
  - `packages/service/common/system/initError.ts:136`

#### 问题

初始化 Mongo 时把 `mongoUrl: MONGO_URL` 放入错误 meta。`runInitializationStep` 会把 meta 输出到 `console.error` 和 logger：

```ts
meta: { mongoUrl: MONGO_URL }
```

Mongo URI 往往包含用户名、密码和连接参数。

#### 触发场景

配置带密码的 `MONGODB_URI`，并让 Mongo 连接失败。

#### 影响

数据库凭证可能进入启动日志、容器日志或日志平台。

#### 建议修复

- 不记录完整连接串。
- 用 URL parser 移除 username、password 和敏感 query。
- 避免 `console.error` 绕过 logger 脱敏策略。
