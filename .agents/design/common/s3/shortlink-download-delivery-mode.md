# S3 短链下载传输模式设计

## 0. 文档标识

- 任务前缀：`s3-shortlink-delivery-mode`
- 文档文件名：`shortlink-download-delivery-mode.md`
- 更新时间：2026-07-09
- 推荐 PR：PR 1 后续增强
- 优先级：P1

## 1. 背景

PR1 短链方案把 FastGPT 对外签发的下载 URL 从旧 JWT 链接改成：

```text
/api/system/file/d/<aliasId>.<expMinute36>.<sig>
```

但当前 `S3BaseBucket.createExternalUrl` 的下载模式仍由 `STORAGE_EXTERNAL_ENDPOINT` 隐式推断：

```ts
export const storageDownloadMode = serviceEnv.STORAGE_EXTERNAL_ENDPOINT ? 'presigned' : 'proxy';
```

这会导致一个问题：只要部署方配置了 S3 external endpoint，`createExternalUrl` 默认就继续返回 S3 presigned URL，而不是 FastGPT 短链。这样在配置 external endpoint 的环境里，AI 引用、Markdown 预览、文件列表等场景仍可能暴露很长的 S3 presigned 链接，无法彻底解决“模型复述链接时改坏 URL”的问题。

## 2. 第一性原理判断

这里实际有两个不同维度：

1. **公开 URL 形态**：FastGPT 返回给前端、用户、AI 上下文的是短链还是 S3 presigned 长链。
2. **文件字节传输路径**：文件内容由 FastGPT proxy 输出，还是由浏览器直接访问 S3/CDN。

`STORAGE_EXTERNAL_ENDPOINT` 只说明 S3 对外可访问，不应该直接决定公开 URL 形态。

更合理的目标是：

1. 对外默认始终返回 FastGPT 短链，降低链接长度和模型幻觉概率。
2. 如果 S3/CDN 可外部访问，短链访问时可以 `302` 到短 TTL presigned URL，让浏览器直连 S3/CDN，减少 FastGPT 服务端带宽。
3. 旧 presigned 直出模式可以作为兼容选项，但不应该是配置 external endpoint 后的默认公开形态。

## 3. 目标

1. 新增显式下载传输模式配置，不再只通过 `STORAGE_EXTERNAL_ENDPOINT` 推断。
2. `createExternalUrl` 默认返回 FastGPT 短链，即使配置了 `STORAGE_EXTERNAL_ENDPOINT`。
3. 短链下载入口支持两种内部传输策略：
   - `proxy`：FastGPT 校验短链后直接代理 S3 文件流。
   - `redirect`：FastGPT 校验短链后生成短 TTL S3 presigned URL，并返回 HTTP 302。
4. `redirect` 模式下，文件字节由浏览器直连 S3/CDN，不消耗 FastGPT 服务端下载带宽。
5. 继续保留旧 JWT 下载路由 verify 兼容，不再新增旧 JWT 签发。
6. 继续允许显式 presigned 直出作为高级兼容模式，但需要明确配置。

## 4. 非目标

1. 不改变 upload 短 session token 设计。
2. 不改变 download alias 的 Mongo schema 主结构。
3. 不把业务资源权限下沉到 S3 短链代理层。
4. 不保证已经 302 出去的 S3 presigned URL 可以被立即撤销。
5. 不要求第一版实现 CDN 私有签名 URL；本设计只覆盖现有 S3 presigned URL 和 CDN host rewrite。

## 5. 推荐配置设计

新增环境变量：

```text
STORAGE_DOWNLOAD_URL_MODE=short-proxy | short-redirect | presigned
```

模式含义：

| 模式 | FastGPT 对外返回 | 文件字节传输 | 是否需要 external endpoint | 适合场景 |
|---|---|---|---|---|
| `short-proxy` | FastGPT 短链 | FastGPT proxy S3 stream | 不需要 | 默认稳妥、内网 S3、私有部署 |
| `short-redirect` | FastGPT 短链 | 浏览器 302 后直连 S3/CDN | 需要 | 有外部 S3/CDN，想省 FastGPT 流量 |
| `presigned` | S3 presigned 长链 | 浏览器直连 S3/CDN | 需要 | 旧行为兼容或极致性能场景 |

推荐默认值：

```ts
const storageDownloadUrlMode = (() => {
  if (serviceEnv.STORAGE_DOWNLOAD_URL_MODE) return serviceEnv.STORAGE_DOWNLOAD_URL_MODE;
  return 'short-proxy';
})();
```

不建议继续用 `STORAGE_EXTERNAL_ENDPOINT ? 'presigned' : 'proxy'` 作为默认，因为 external endpoint 的语义是“可外部访问”，不是“可以把长链暴露给 AI 和用户”。

如果担心升级后有 external endpoint 的部署带宽压力突增，可以采用兼容默认：

```ts
return serviceEnv.STORAGE_EXTERNAL_ENDPOINT ? 'short-redirect' : 'short-proxy';
```

但不推荐默认 `presigned`，因为这会绕过短链目标。

## 6. 访问流程

### 6.1 `short-proxy`

```text
createExternalUrl
  -> createS3DownloadAccessUrl
  -> 返回 /api/system/file/d/<signedAlias>

浏览器 GET /api/system/file/d/<signedAlias>
  -> 校验 exp + HMAC
  -> 查询 alias 文档
  -> 检查 disabledAt
  -> 读取 S3 stream
  -> FastGPT 返回文件内容
```

优点：

1. S3 不需要对外暴露。
2. FastGPT 可以完全控制响应头、错误结构、日志和撤销。
3. 对浏览器、移动端、爬虫、模型上下文暴露的始终是短链。

缺点：

1. 大文件下载会消耗 FastGPT 服务端出口带宽。
2. Range、缓存、并发等能力需要 proxy 层自己处理或增强。

### 6.2 `short-redirect`

```text
createExternalUrl
  -> createS3DownloadAccessUrl
  -> 返回 /api/system/file/d/<signedAlias>

浏览器 GET /api/system/file/d/<signedAlias>
  -> 校验 exp + HMAC
  -> 查询 alias 文档
  -> 检查 disabledAt
  -> generatePresignedGetUrl({ expiredSeconds: redirectTtlSeconds })
  -> 可选 replaceS3UrlWithCdnEndpoint
  -> 302 Location: <short-lived S3 presigned URL>

浏览器自动请求 Location
  -> 直接从 S3/CDN 下载文件内容
```

优点：

1. 对外展示仍是 FastGPT 短链。
2. 文件内容不经过 FastGPT，不消耗 FastGPT 下载带宽。
3. S3/CDN 可以处理 Range、缓存、边缘加速和高并发。
4. 短链入口仍可做 alias revoke、过期校验、审计日志。

缺点：

1. 浏览器最终会在 Network 面板里看到 S3 presigned URL。
2. 一旦 302 出去，已生成的 S3 presigned URL 在短 TTL 内仍然可用。
3. 每次访问短链都会多一次 FastGPT 校验请求和一次 302 往返。
4. 对非浏览器客户端，必须支持跟随 302；多数 HTTP 客户端默认支持，但 API 调用者可能需要注意。

### 6.3 `presigned`

```text
createExternalUrl
  -> generatePresignedGetUrl
  -> 返回 S3 presigned URL
```

优点：

1. 路径最短，FastGPT 不参与下载访问。
2. 与旧 external endpoint 行为一致。

缺点：

1. 对外 URL 长，仍容易被模型改坏。
2. FastGPT 失去统一入口日志和 alias revoke 能力。
3. 已签发 URL 只能等 S3 presigned 自然过期。
4. object path 和 query 签名细节暴露给前端和模型上下文。

该模式应该只用于明确要求旧行为或明确不需要 AI 引用短链的场景。

## 7. redirect TTL 设计

`short-redirect` 下有两层过期时间：

1. FastGPT 短链 URL 自带 `expMinute36`，控制公开短链的有效期。
2. S3 presigned URL 是访问短链时临时生成的，控制直连 S3 的短期有效期。

建议新增配置：

```text
STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS=300
```

默认值建议 300 秒，即 5 分钟。

生成 S3 presigned 时应使用：

```ts
const redirectExpiresSeconds = Math.min(
  STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS,
  secondsUntilSignedAliasExpires
);
```

设计原因：

1. 不能让 S3 presigned URL 比 FastGPT 短链更长。
2. 5 分钟通常足够浏览器完成跳转和下载发起。
3. 即使 presigned URL 被复制，也只暴露很短时间。

对于超大文件，S3 一般只在请求开始时校验 presigned URL 是否有效；请求开始后即使 URL 过期，正在进行的下载通常不会被中断。但不同 S3 兼容实现可能有差异，第一版建议在文档中说明这一点。

## 8. 错误与状态码设计

短链校验失败时，无论传输模式如何，都应返回统一错误：

| 场景 | HTTP | 公开错误 |
|---|---|---|
| alias 格式非法 | 403 | `CommonErrEnum.unAuthFile` |
| alias 过期 | 403 | `CommonErrEnum.unAuthFile` |
| 签名篡改 | 403 | `CommonErrEnum.unAuthFile` |
| alias 不存在 | 403 | `CommonErrEnum.unAuthFile` |
| alias revoked | 403 | `CommonErrEnum.unAuthFile` |
| S3 object missing | 404 | `CommonErrEnum.fileNotFound` |
| S3 bucket missing | 500 | 内部错误 |
| redirect 模式未配置 external endpoint | 500 或启动期配置错误 | 内部错误 |

`short-redirect` 的 `HEAD` 行为建议：

1. 第一版可以和 `GET` 一样返回 302，让客户端自己对 S3 发 HEAD/GET。
2. 如果需要保持 proxy 模式里 `HEAD` 返回 metadata 的语义，后续可以对 `HEAD` 做 proxy metadata 响应，不做 302。

建议第一版采用“GET/HEAD 都 302”，行为简单，也更符合 redirect 模式。

## 9. 函数与文件组织

### 9.1 新增/修改类型和配置

| 文件 | 修改点 |
|---|---|
| `packages/service/env.ts` | 新增 `STORAGE_DOWNLOAD_URL_MODE` 和 `STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS` env schema |
| `packages/service/common/s3/config/constants.ts` | 新增 `StorageDownloadUrlModeSchema`、`storageDownloadUrlMode`、`storageDownloadRedirectTtlSeconds` |
| `packages/service/common/s3/contracts/type.ts` | 将 `DownloadModeSchema` 定义为 `short-proxy/short-redirect/presigned` |

### 9.2 短链 service

| 文件 | 修改点 |
|---|---|
| `packages/service/common/s3/accessLink/type.ts` | `S3ProxyDownloadPayload` 可选增加 `expiresAt` 或新增 verified result 类型 |
| `packages/service/common/s3/accessLink/downloadAlias/service.ts` | `verifyS3DownloadAccess` 返回 alias payload 时带上 URL 过期时间，供 redirect TTL 取 `min` |

建议新增返回类型：

```ts
export const VerifiedS3DownloadAccessSchema = S3ProxyDownloadPayloadSchema.extend({
  expiresAt: z.coerce.date()
});
```

### 9.3 app proxy

| 文件 | 修改点 |
|---|---|
| `projects/app/src/service/common/s3/proxy.ts` | 新增 `handleS3ProxyDownloadRedirect` 或让 `handleS3ProxyDownload` 支持 `deliveryMode` |
| `projects/app/src/pages/api/system/file/d/[signedAlias].ts` | 根据 `storageDownloadUrlMode` 选择 proxy 或 redirect |
| `projects/app/src/pages/api/system/file/download/[token].ts` | 旧 JWT 兼容入口建议继续 proxy，不做 redirect，避免改变历史链接行为 |

建议函数拆分：

```ts
export const handleS3ProxyDownload = async (...) => {
  // 现有 stream proxy
};

export const handleS3RedirectDownload = async ({
  res,
  payload,
  expiresAt
}: {
  res: NextApiResponse;
  payload: S3ProxyDownloadPayload;
  expiresAt: Date;
}) => {
  // generatePresignedGetUrl + replaceS3UrlWithCdnEndpoint + 302
};
```

`redirect` 函数需要注意：

1. 使用 `bucket.externalClient.generatePresignedGetUrl`。
2. 保留 `responseContentType`。
3. 使用 `replaceS3UrlWithCdnEndpoint`。
4. `redirectTtlSeconds <= signedAliasRemainingSeconds`。
5. `res.redirect(302, url)` 或手动设置 `Location` 后 `end`。

### 9.4 S3BaseBucket

| 文件 | 修改点 |
|---|---|
| `packages/service/common/s3/buckets/base.ts` | `createExternalUrl` 默认对 `short-proxy` 和 `short-redirect` 都返回短链；只有 `presigned` 直出 S3 URL |

伪代码：

```ts
if ((mode || storageDownloadUrlMode) !== 'presigned') {
  return {
    bucket: this.bucketName,
    key,
    url: await createS3DownloadAccessUrl(...)
  };
}

return presignedUrl;
```

注意：这里的 `mode` 使用新三态，不保留旧 `proxy` 值。

## 10. 模式策略

### 10.1 调用约定

本 PR 未合并前可以直接调整内部调用契约，因此不保留 `mode: 'proxy'` 兼容入口。

允许的 mode 值：

| 值 | 解释 |
|---|---|
| `mode: 'short-proxy'` | 强制返回 FastGPT 短链，短链访问时由 app proxy 文件流 |
| `mode: 'short-redirect'` | 强制返回 FastGPT 短链，短链访问时按全局 short-redirect 策略 302 |
| `mode: 'presigned'` | 强制返回 S3 presigned 长链 |
| 未传 mode | 使用 `STORAGE_DOWNLOAD_URL_MODE` |

### 10.2 行为兼容

1. 旧 JWT 下载路由继续可用，但不会再被新代码签发。
2. 显式 `mode: 'presigned'` 的内部调用仍可拿到 S3 presigned URL。
3. 未显式 mode 的 `createExternalUrl` 默认改为短链，可能改变有 external endpoint 部署的 URL 形态。
4. 如果采用 `short-redirect` 默认，则带宽行为接近旧 presigned，但公开 URL 变短。

## 11. 安全考量

1. `short-redirect` 不能跳过短链校验。必须先校验 alias HMAC、过期、disabledAt，再生成 S3 presigned。
2. redirect 生成的 S3 presigned TTL 必须短，且不能超过 signed alias 剩余有效期。
3. alias revoke 后，新的短链访问会被拒绝；已经 302 出去的 S3 presigned 在短 TTL 内仍可能可用，这是 redirect 模式的必然代价。
4. 不要把 S3 presigned URL 写回业务数据、聊天记录或模型上下文。
5. redirect Location 必须来自可信 S3 SDK 生成结果，不接受用户传入 URL。
6. 如果配置 CDN host rewrite，要确认 CDN 不会把带签名 query 的私有对象缓存成公开长期资源。

## 12. 性能与成本考量

| 指标 | short-proxy | short-redirect | presigned |
|---|---|---|---|
| FastGPT 出口流量 | 高 | 很低 | 无 |
| FastGPT 请求数 | 每次下载 1 次，且持有连接 | 每次下载 1 次短请求 | 无 |
| S3/CDN 下载能力 | 间接 | 直接 | 直接 |
| 链接长度 | 短 | 短 | 长 |
| 撤销入口 | 强 | 中等 | 弱 |
| AI 引用稳定性 | 好 | 好 | 差 |

`short-redirect` 是有 external endpoint 场景下最均衡的方案。

## 13. Decisions

1. 默认模式采用 `short-proxy`，不再由 `STORAGE_EXTERNAL_ENDPOINT` 隐式切到 presigned。
2. `STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS` 默认 300 秒。
3. `HEAD` 在 `short-redirect` 模式下和 `GET` 一样返回 302。
4. 302 响应设置 `Cache-Control: no-store`，避免中间层缓存临时 Location。
5. 继续允许显式 `mode: 'presigned'` 或 `STORAGE_DOWNLOAD_URL_MODE=presigned` 作为兼容模式。
6. 第一版不新增 redirect 访问审计，只保持短链校验、alias revoke 和对象存在检查。

## 14. Tasks

- [x] D1 确认默认模式策略：`short-proxy` 或 `external endpoint -> short-redirect`。
- [x] D2 在 `packages/service/env.ts` 新增 `STORAGE_DOWNLOAD_URL_MODE` 和 `STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS` schema。
- [x] D3 在 `packages/service/common/s3/config/constants.ts` 新增下载模式配置和 redirect TTL 常量。
- [x] D4 调整 `DownloadModeSchema`，仅支持 `short-proxy/short-redirect/presigned`。
- [x] D5 改造 `verifyS3DownloadAccess`，返回 `expiresAt` 供 redirect TTL 计算。
- [x] D6 在 `projects/app/src/service/common/s3/proxy.ts` 新增 `handleS3RedirectDownload`。
- [x] D7 改造 `d/[signedAlias].ts`，根据下载模式选择 proxy 或 redirect。
- [x] D8 改造 `S3BaseBucket.createExternalUrl`，默认 `short-proxy/short-redirect` 都返回短链，只有 `presigned` 返回 S3 URL。
- [x] D9 保持旧 `download/[token].ts` JWT 路由只做 verify + proxy，不新增旧 JWT 签发。
- [x] D10 补充配置单测：默认值、external endpoint、有显式 env、三态模式。
- [x] D11 补充 `createExternalUrl` 单测：external endpoint 存在时默认仍返回短链，显式 `presigned` 才返回 S3 URL。
- [x] D12 补充短链 redirect API 测试：校验通过后 302，Location 是短 TTL presigned/CDN URL。
- [x] D13 补充 redirect 安全测试：过期 alias、篡改 alias、revoked alias 不生成 presigned。
- [ ] D14 补充旧 JWT 兼容测试：旧路由仍 proxy，不走 redirect。
- [x] D15 运行 PR 局部测试和 app TypeScript 检查。

## 15. 推荐结论

建议采用：

```text
STORAGE_DOWNLOAD_URL_MODE=short-proxy | short-redirect | presigned
```

并把默认公开 URL 形态统一为 FastGPT 短链。

如果用户配置了 S3 external endpoint，推荐使用 `short-redirect`，而不是直接返回 S3 presigned URL。这样既能保持短链对 AI 友好，又能让文件字节由浏览器直连 S3/CDN，避免消耗 FastGPT 服务端下载带宽。
