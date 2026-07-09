# Plugin Server 短链集成设计

## 0. 文档标识

- 任务前缀：`plugin-server-shortlink-integration`
- 文档文件名：`plugin-server-shortlink-integration.md`
- 更新时间：2026-07-08
- 关联文档：
  - `.agents/design/common/s3/shortlink-access-token.md`
  - `.agents/design/common/s3/shortlink-sdk-wrapper.md`
  - `.agents/design/common/s3/shortlink-download-delivery-mode.md`
- 推荐 PR：单独 PR，先只做 plugin server 文件访问 URL 短链化
- 优先级：P1

## 1. 结论

推荐把短链集成到 plugin server 的 `RemoteFileStorageRepo.getAccessUrl()` 这条链路，不建议第一版改 `sdk/client.uploadPlugin()` 的上传协议，也不需要改 `ctx.invoke.uploadFile()`。

原因：

1. `sdk/client.uploadPlugin()` 是主项目把 `.pkg/.zip` bytes 上传到 plugin server 的业务 API，当前没有把长链接暴露给前端、用户或 AI 上下文，不是短链要解决的问题。
2. plugin server 需要返回给主项目、前端、市场列表、模型/工作流模板的 `icon/readmeUrl/avatar` 才是会长期被展示、缓存和引用的 URL。
3. `ctx.invoke.uploadFile()` 是插件工具生成文件后反向调用主项目 `/api/invoke/fileUpload`，文件实际进入主项目 chat S3；主项目短链已经覆盖返回的 `accessURL`，plugin server 不应该重复实现这条上传链路。

第一版推荐目标：

```text
plugin server public asset URL:
  before: S3 public URL 或 S3 presigned URL
  after:  /api/system/file/d/<aliasId>.<expMinute36>.<sig>
```

如果存在外部 S3/CDN，第一版可以先与主项目当前行为对齐：未配置 external endpoint 时走短链 proxy，配置 external endpoint 时保留直出；但更推荐新增显式模式开关，允许后续切到 `short-redirect`，做到“对外仍是短链，字节流由浏览器直连 S3/CDN”。

## 2. 当前链路审查

### 2.1 主项目上传插件包到 plugin server

涉及文件：

| 仓库 | 文件 | 作用 |
|---|---|---|
| fastgpt-s3 | `projects/app/src/pages/api/core/plugin/admin/pkg/upload.ts` | 管理员上传 `.pkg/.zip` 到主项目 API，主项目先用 multer 落临时文件 |
| fastgpt-s3 | `packages/service/thirdProvider/fastgptPlugin/index.ts` | 实例化 `FastGPTPluginClient` |
| fastgpt-plugin | `sdk/client/src/client.ts` | `uploadPlugin()` 组装 multipart `POST /api/plugin/upload` |
| fastgpt-plugin | `apps/server/src/routes/plugin.route.ts` | 接收 multipart 文件，转成 stream 调用 usecase |
| fastgpt-plugin | `packages/usecase/src/plugin/plugin-upload.uc.ts` | 保存到本地临时文件，解析 `.pkg/.zip` |
| fastgpt-plugin | `packages/infrastructure/src/plugin/plugin.repo.ts` | 把 README/logo/assets/index.js 写入 public/private remote storage |

这条链路不是 S3 presigned URL，不存在“AI 复述长 JWT/签名链接导致幻觉”的问题。把它改成短 upload URL 需要新增一套插件包上传 session 协议，收益不匹配第一版成本。

### 2.2 plugin server 自己的远端文件访问 URL

涉及文件：

| 仓库 | 文件 | 作用 |
|---|---|---|
| fastgpt-plugin | `packages/infrastructure/src/file-storage/remote-file-storage.repo.ts` | `save()` 直接 server-side 上传 S3；`getAccessUrl()` 返回外部可访问 URL |
| fastgpt-plugin | `packages/infrastructure/src/plugin/plugin.repo.ts` | `getPluginFileAccessURL()` 给插件 icon/readme/assets 生成访问 URL |
| fastgpt-plugin | `packages/infrastructure/src/static-data/models/model-static.ts` | 模型 provider/channel avatar URL |
| fastgpt-plugin | `packages/infrastructure/src/static-data/workflow/init.ts` | workflow template avatar URL |
| fastgpt-plugin | `apps/server/src/routes/model.route.ts` | 向主项目返回模型列表和头像 |
| fastgpt-plugin | `apps/server/src/routes/workflow.route.ts` | 向主项目返回 workflow 模板和头像 |

这是第一版应该改的核心链路。`getAccessUrl()` 返回的 URL 会进入 plugin DTO：

```ts
icon: z.string()
readmeUrl: z.url().optional()
avatar: z.string()
```

因此短链必须是绝对 URL，不能只返回相对路径。plugin server 需要自己的 public base URL，不能复用 `FASTGPT_BASE_URL`，因为后者指向主 FastGPT。

### 2.3 插件工具生成文件并回传主项目

涉及文件：

| 仓库 | 文件 | 作用 |
|---|---|---|
| fastgpt-plugin | `sdk/factory/src/invoke.client.ts` | `ctx.invoke.uploadFile()` 把文件流发送给插件运行时 host |
| fastgpt-plugin | `packages/infrastructure/src/plugin/plugin-runtime/drivers/local-pool/pod/index.ts` | host 收到 uploadFile 请求后转给 invoke session |
| fastgpt-plugin | `packages/infrastructure/src/plugin/invoke/invoke.impl.ts` | `InvokeManager.uploadFile()` multipart 调用主项目 `/api/invoke/fileUpload` |
| fastgpt-s3 | `projects/app/src/pages/api/invoke/fileUpload.ts` | 主项目接收 multipart 文件 |
| fastgpt-s3 | `packages/service/support/invoke/invoke.ts` | `InvokeProcessor.handleFileUpload()` 校验权限并上传 chat file |
| fastgpt-s3 | `packages/service/common/s3/sources/chat/index.ts` | `uploadChatFile()` 进入主项目 S3 |

主项目 `uploadFileByBody()` 返回 `createExternalUrl()` 的结果。主项目短链启用后，插件工具拿到的 `accessURL` 已经是主项目侧策略控制的 URL。plugin server 不需要改这条链路。

## 3. 设计原则

1. 复用 `@fastgpt-sdk/storage/access-link` 的短链 core，不复制 HMAC、alias、TTL、token hash 逻辑。
2. plugin server 只实现 runtime adapter：env、Mongo model/store、Hono route、S3 stream/redirect proxy。
3. 不把内部 server-side `save()` 改成走自己的 upload URL；那会多一次 HTTP loopback，并降低可靠性。
4. 短链签发前必须已经完成业务归属确认。plugin server 的 `getAccessUrl()` 只应被内部 repo/static data 调用，不接受用户传任意 key 直接签发。
5. 短链下载路由必须匿名可访问，否则浏览器、markdown、主项目、AI 引用都无法直接打开。
6. 删除对象时要 best-effort 清理 alias；遗漏时仍依赖 Mongo TTL 兜底。

## 4. 下载 URL 模式

推荐新增显式配置：

```text
STORAGE_DOWNLOAD_URL_MODE=short-proxy | short-redirect | presigned
```

| 模式 | plugin server 返回给上游 | 文件字节传输 | 需要 external endpoint | 说明 |
|---|---|---|---|---|
| `short-proxy` | plugin server 短链 | plugin server 代理 S3 stream | 否 | 最稳妥，适合没有外部 S3 的部署 |
| `short-redirect` | plugin server 短链 | 校验后 302 到短 TTL S3 URL | 是 | 对外短链，同时减少 plugin server 带宽 |
| `presigned` | S3 public/presigned URL | 浏览器直连 S3 | 是 | 兼容旧行为，不解决长链问题 |

默认值有两个选择：

| 默认策略 | 行为 | 适合场景 |
|---|---|---|
| 保守默认 | `STORAGE_EXTERNAL_ENDPOINT ? presigned : short-proxy` | 与主项目当前行为最接近，升级风险低 |
| 短链优先 | `STORAGE_EXTERNAL_ENDPOINT ? short-redirect : short-proxy` | 更彻底解决 AI/markdown 引用长链问题 |

本设计推荐代码支持三种模式，默认可以先选“保守默认”。测试环境评估通过后，再把默认调整为“短链优先”。

## 5. URL 与协议

复用主项目短链格式：

```text
GET  /api/system/file/d/<aliasId>.<expMinute36>.<sig>
HEAD /api/system/file/d/<aliasId>.<expMinute36>.<sig>
```

不建议第一版启用：

```text
PUT /api/system/file/u/<shortToken>
```

原因是 plugin server 当前没有前端/主项目通过 presigned URL 直传到 plugin server S3 的必要链路。`uploadPlugin()` 如要改成 upload session，需要重新设计插件包上传 API，不是 `RemoteFileStorageRepo` 内部替换可以完成的事。

## 6. Env 设计

建议新增：

```ts
FILE_TOKEN_KEY: string
FILE_ACCESS_BASE_URL: string
STORAGE_DOWNLOAD_URL_MODE?: 'short-proxy' | 'short-redirect' | 'presigned'
STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS: number
```

字段说明：

| 字段 | 说明 |
|---|---|
| `FILE_TOKEN_KEY` | 短链 HMAC secret。生产环境必须显式配置，建议至少 32 字符；不要复用弱默认值 |
| `FILE_ACCESS_BASE_URL` | plugin server 自身对外可访问 origin，例如 `https://plugin.example.com` |
| `STORAGE_DOWNLOAD_URL_MODE` | 控制 `getAccessUrl()` 对外 URL 形态和下载传输路径 |
| `STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS` | `short-redirect` 下临时 S3 presigned URL 的有效期，建议默认 300 秒 |

注意：

1. `FASTGPT_BASE_URL` 指向主 FastGPT，只能用于 invoke 回调主项目，不能用于 plugin server 文件短链。
2. 本地开发可以默认 `FILE_ACCESS_BASE_URL=http://localhost:${PORT}`；生产环境必须配置真实公网或内网可访问地址。
3. 如果 `STORAGE_DOWNLOAD_URL_MODE=short-redirect` 但没有 `STORAGE_EXTERNAL_ENDPOINT`，应在启动期或首次访问时报配置错误，不能静默退化成长链或不可访问内网 URL。

## 7. Schema 设计

### 7.1 Zod schema

建议放在：

```text
packages/infrastructure/src/file-storage/access-link/type.ts
```

核心 schema：

```ts
const UrlSafeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const HexSha256Schema = z.string().length(64).regex(/^[a-f0-9]+$/);

export const FileAccessBucketNameSchema = z.string().min(1);
export const FileAccessObjectKeySchema = z.string().min(1);

export const FileDownloadAliasIdSchema = UrlSafeTokenSchema.min(12).max(32);
export const FileDownloadAliasKeySchema = HexSha256Schema;
export const FileDownloadExpiresMinuteSchema = z.string().min(1).max(8).regex(/^[0-9a-z]+$/);
export const FileDownloadSignatureSchema = UrlSafeTokenSchema.min(16).max(64);
export const FileSignedDownloadAliasValueSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{12,32}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{16,64}$/);

export const FileDownloadAliasSchema = z.object({
  aliasId: FileDownloadAliasIdSchema,
  aliasKey: FileDownloadAliasKeySchema,
  bucketName: FileAccessBucketNameSchema,
  objectKey: FileAccessObjectKeySchema,
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date(),
  lastIssuedAt: z.coerce.date(),
  purgeAt: z.coerce.date(),
  disabledAt: z.coerce.date().optional()
});

export const FileUploadSessionSchema = z.object({
  tokenHash: HexSha256Schema,
  bucketName: FileAccessBucketNameSchema,
  objectKey: FileAccessObjectKeySchema,
  maxSize: z.number().positive(),
  uploadConstraints: z.object({
    defaultContentType: z.string().min(1),
    allowedExtensions: z.array(z.string()).optional()
  }),
  metadata: z.record(z.string(), z.string()).optional(),
  createTime: z.coerce.date(),
  expiresAt: z.coerce.date(),
  usedAt: z.coerce.date().optional(),
  revokedAt: z.coerce.date().optional()
});
```

即使第一版不启用 upload route，也建议把 upload session schema/store 一起落好，因为当前 SDK factory `createS3AccessLinkService()` 需要同时传入 download/upload stores。upload 相关能力先不暴露 HTTP 路由即可。

### 7.2 Mongo schema

新增：

```text
packages/infrastructure/src/storage/mongo/models/s3-download-alias.model.ts
packages/infrastructure/src/storage/mongo/models/s3-upload-session.model.ts
```

并在：

```text
packages/infrastructure/src/storage/mongo/models/index.ts
```

注册模型。

`s3_download_aliases`：

```ts
{
  aliasId: string;
  aliasKey: string;
  bucketName: string;
  objectKey: string;
  filename?: string;
  responseContentType?: string;
  createTime: Date;
  updateTime: Date;
  lastIssuedAt: Date;
  purgeAt: Date;
  disabledAt?: Date;
}
```

索引：

```ts
schema.index({ aliasId: 1 }, { unique: true });
schema.index({ aliasKey: 1 }, { unique: true });
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ bucketName: 1, objectKey: 1 });
```

`s3_upload_sessions`：

```ts
{
  tokenHash: string;
  bucketName: string;
  objectKey: string;
  maxSize: number;
  uploadConstraints: object;
  metadata?: Record<string, string>;
  createTime: Date;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
}
```

索引：

```ts
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ bucketName: 1, objectKey: 1 });
```

## 8. 文件与函数组织

### 8.1 SDK 依赖

必须先统一 plugin repo 依赖：

| 文件 | 修改 |
|---|---|
| `packages/infrastructure/package.json` | `@fastgpt-sdk/storage` 从 `^0.7.0` 改成 `catalog:` 或 `^0.8.0` |
| `pnpm-lock.yaml` | 更新锁文件，避免同时安装 0.7.0/0.8.0 |

原因：`@fastgpt-sdk/storage/access-link` 子路径在新版 SDK 中才存在。`apps/server` 当前已经使用 catalog `^0.8.0`，但 `packages/infrastructure` 仍是 `^0.7.0`，直接接入会留下类型和运行时风险。

### 8.2 access-link adapter

新增目录：

```text
packages/infrastructure/src/file-storage/access-link/
```

建议文件：

| 文件 | 职责 |
|---|---|
| `constants.ts` | route 常量、alias/token 长度、默认 TTL 等 plugin server 常量 |
| `type.ts` | Zod schema 与类型，覆盖 DB/route/service 边界 |
| `download-alias.store.ts` | 实现 SDK `S3DownloadAliasStore` |
| `upload-session.store.ts` | 实现 SDK `S3UploadSessionStore` |
| `access-link.service.ts` | `createS3AccessLinkService()` 实例化，注入 env、routes、stores、id generator |
| `cleanup.ts` | plugin server 本地扩展的 alias 清理函数，例如按 prefix 删除 |
| `proxy.ts` | Hono 下载代理/302 redirect、错误映射 |
| `index.ts` | 统一导出 |

`access-link.service.ts` 示例结构：

```ts
export const createFileAccessLinkService = (deps: {
  mongoClient: MongoClient;
  fileAccessBaseUrl: string;
  secret: string;
}) => {
  return createS3AccessLinkService({
    secret: deps.secret,
    routes: {
      buildDownloadUrl: (signedAlias) =>
        `${deps.fileAccessBaseUrl}/api/system/file/d/${signedAlias}`,
      buildUploadUrl: (token) =>
        `${deps.fileAccessBaseUrl}/api/system/file/u/${token}`
    },
    stores: {
      downloadAlias: createMongoDownloadAliasStore(deps.mongoClient),
      uploadSession: createMongoUploadSessionStore(deps.mongoClient)
    },
    uploadSessionUsePolicy: 'mark-used'
  });
};
```

说明：`buildUploadUrl` 是为了满足 SDK core 当前的统一 service 入参。PR1 不挂载
`/api/system/file/u/:token`，也不从业务调用 `createUploadUrl()`；upload session store 只作为
后续协议升级的预留和类型完整性支持。

### 8.3 RemoteFileStorageRepo

修改：

```text
packages/infrastructure/src/file-storage/remote-file-storage.repo.ts
```

建议扩展 deps：

```ts
type RemoteFileStorageDeps = {
  mongoClient: MongoClient;
  s3Clients: {
    internalClient: IStorage;
    externalClient?: IStorage;
  };
  accessLinkService?: S3AccessLinkService;
  downloadUrlMode: 'short-proxy' | 'short-redirect' | 'presigned';
};
```

`getAccessUrl()` 逻辑：

```text
getAccessUrl(fileKey)
  -> normalizedKey = joinPath(fileKey)
  -> if mode === presigned:
       保留当前 public/external/presigned 行为
  -> else:
       accessLinkService.createDownloadUrl({
         bucketName: getBucketName(),
         objectKey: normalizedKey,
         expiredTime: now + _getURLExpiresIn,
         filename: basename(normalizedKey)
       })
```

不建议在 `getAccessUrl()` 每次都 `getObjectMetadata()`，否则模型列表、workflow 列表会额外打大量 S3 HEAD。下载时 proxy 再取 metadata 即可。

删除链路需要一起修正：

| 方法 | 当前问题/设计 |
|---|---|
| `delete(fileKey)` | 当前只调用 `externalClient?.deleteObject()`，private 或无 external client 时不会删对象；应改为 `internalClient.deleteObject()` |
| `delete(fileKey)` | 删除对象成功后 best-effort `deleteDownloadAliasByObject(bucketName, objectKey)` |
| `deletePath(prefix)` | 删除 S3 prefix 后 best-effort `deleteDownloadAliasesByPrefix(bucketName, prefix)` |
| `move(from, to)` | 删除旧 key 后清理旧 alias；新 key 后续重新签发新 alias |

### 8.4 Hono route

新增：

```text
apps/server/src/routes/file-access.route.ts
```

路由：

```text
GET  /system/file/d/:signedAlias
HEAD /system/file/d/:signedAlias
```

在 `apps/server/main.ts` 中挂载到：

```ts
app.route('/api', fileAccessRoute);
```

但当前 `packages/infrastructure/src/hono/app.ts` 有：

```ts
app.use('/api/*', bearerHonoAuthMiddleware);
```

因此必须同步修改 auth middleware，跳过公开文件访问路由：

```ts
const PUBLIC_API_PATHS = [
  /^\/api\/system\/file\/d\//
];
```

如果未来真的启用 upload route，再把 `/api/system/file/u/` 加进去。第一版不应提前开放 upload route。

### 8.5 下载代理

`proxy.ts` 需要提供：

```ts
handleFileAccessDownload(c, deps)
resolveFileAccessRouteError(error)
```

`short-proxy`：

1. `accessLinkService.verifyDownloadAlias(signedAlias)`
2. 根据 `bucketName` 找到 public/private `RemoteFileStorageRepo`
3. `getReadStream(objectKey)` 与 `getInfo(objectKey)`
4. 设置：
   - `Content-Type`
   - `Content-Length`
   - `Content-Disposition: inline; filename="..."`
   - `Cache-Control: public, max-age=31536000`
5. `HEAD` 只返回 headers，不输出 body
6. `GET` 返回 stream body

`short-redirect`：

1. 完成同样的短链校验
2. 使用对应 bucket 的 external client 生成短 TTL presigned GET URL
3. 返回 `302 Location`
4. `GET/HEAD` 第一版都可以 302，保持实现简单

## 9. 错误设计

短链错误不能暴露 alias 是否存在、bucketName、objectKey、token hash 等内部细节。

建议错误映射：

| 场景 | HTTP | 对外错误 | 日志 |
|---|---|---|---|
| signedAlias 格式非法 | 403 | `Unauthorized` | debug/info |
| signedAlias 过期 | 403 | `Unauthorized` | debug/info |
| HMAC 签名错误 | 403 | `Unauthorized` | warn，记录 requestId，不记录完整 URL |
| alias 不存在 | 403 | `Unauthorized` | info |
| alias revoked | 403 | `Unauthorized` | info |
| bucket 不存在或配置错误 | 500 | `Internal Server Error` | error |
| S3 object 不存在 | 404 | `Not Found` | info/warn |
| S3 stream 中途失败 | 500 或 destroy response | `Internal Server Error` | error |
| redirect 模式缺 external endpoint | 500 | `Internal Server Error` | error，启动期最好提前失败 |

实现建议：

```ts
if (isS3AccessLinkError(error)) {
  return R.fail(c, 403, createError(ErrorCode.unauthorized));
}
```

Hono 全局 `onError` 可以处理未捕获错误，但文件代理 route 应尽量自己捕获可预期错误，避免把短链校验失败打成 500。

上游捕获行为：

1. `FastGPTPluginClient` 对非 2xx 会读取 response body 的 `error.message/reason`。
2. route 应返回 plugin server 现有 `{ error: ErrorResponseType }` envelope。
3. `icon/readme/avatar` 这类静态资源访问失败时，浏览器只关心 HTTP status；API 客户端安装插件失败时应能拿到稳定 i18n reason。

## 10. 清理策略

download alias 是 lease-based，不尝试判断“未来是否还会被访问”。

| 对象 | 清理方式 |
|---|---|
| download URL | URL 内 `expMinute36` 到期后自然失效 |
| download alias | `purgeAt` TTL index 自动清理 |
| object 删除 | `delete/deletePath/move` best-effort 删除相关 alias |
| upload session | `expiresAt` TTL index 自动清理，即使第一版不开放 upload route |

`deletePath(prefix)` 没有 SDK core 方法，可以在 plugin adapter 本地加：

```ts
deleteDownloadAliasesByPrefix({ bucketName, prefix })
```

实现为 Mongo `deleteMany({ bucketName, objectKey: { $regex: '^escapedPrefix' } })`，必须 escape regex，不能直接拼用户输入。

## 11. 是否改 uploadPlugin

第一版不改。

如果未来确实要改，可以单独 PR 设计为：

```text
FastGPT app
  -> sdk/client.createPluginUploadSession(files metadata)
  -> plugin server 返回每个文件 uploadUrl/uploadId
  -> sdk/client PUT bytes 到 uploadUrl
  -> sdk/client POST /api/plugin/upload/complete
  -> plugin server 从临时对象读取并解析 pkg
```

但这不是简单替换：

1. 当前 plugin upload usecase 输入是本地 `FileObject`，短 upload route 更自然会先落 S3 临时对象，需要改 usecase 或新增 temp remote file 适配。
2. multipart 一次请求可以批量带多个文件，upload session 会变成多次请求和 complete 协议。
3. 上传失败、取消、超时、临时对象清理都要重新设计。
4. 该链路没有长链接暴露给 AI，所以短链收益低。

除非要解决“大插件包上传绕过主项目中转”或“跨网络直传性能”，否则不建议把它放进本次短链 PR。

## 12. Tasks

### PR1：plugin server public asset download 短链

- [ ] 依赖统一：把 `packages/infrastructure/package.json` 的 `@fastgpt-sdk/storage` 升到 `catalog:` 或 `^0.8.0`，更新 lockfile，确认 `@fastgpt-sdk/storage/access-link` 可被 infrastructure 引用。
- [ ] Env：在 `packages/infrastructure/src/env/index.ts` 增加 `FILE_TOKEN_KEY`、`FILE_ACCESS_BASE_URL`、`STORAGE_DOWNLOAD_URL_MODE`、`STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS`，补充生产环境弱密钥校验。
- [ ] Mongo：新增 `s3-download-alias.model.ts`、`s3-upload-session.model.ts`，并在 `models/index.ts` 注册。
- [ ] Adapter schema：新增 `packages/infrastructure/src/file-storage/access-link/type.ts`，定义 download alias、upload session、route param schema。
- [ ] Store：实现 `download-alias.store.ts` 和 `upload-session.store.ts`，把 Mongo duplicate key 转换成 SDK `S3AccessLinkError(duplicateAliasKey)`。
- [ ] Service：实现 `access-link.service.ts`，复用 `createS3AccessLinkService()`，构造绝对短链 URL。
- [ ] Cleanup：实现 `cleanup.ts`，支持按 object 和 prefix 清理 download alias。
- [ ] Remote storage：修改 `RemoteFileStorageRepo.getAccessUrl()`，按 `STORAGE_DOWNLOAD_URL_MODE` 选择短链或旧 presigned/public URL。
- [ ] Remote storage 删除：修复 `delete()` 使用 `internalClient.deleteObject()`，并在 `delete/deletePath/move` 后 best-effort 清理 alias。
- [ ] Auth：修改 `bearerHonoAuthMiddleware` 或其调用方式，跳过 `/api/system/file/d/*`。
- [ ] Route：新增 `apps/server/src/routes/file-access.route.ts`，支持 `GET/HEAD /api/system/file/d/:signedAlias`。
- [ ] Proxy：实现 `short-proxy` 下载流输出，保留内容类型、长度、inline disposition、cache-control。
- [ ] Redirect：如果本 PR 同时支持 `short-redirect`，实现短 TTL S3 presigned 302；否则先在 mode schema 中保留但启动期拒绝该模式。
- [ ] 错误：实现短链错误到 403、object missing 到 404、配置/bucket 错误到 500 的稳定映射。
- [ ] 单测：覆盖 store create/reuse/duplicate/touchLease/revoke/TTL 字段。
- [ ] 单测：覆盖 `RemoteFileStorageRepo.getAccessUrl()` 在 `short-proxy/presigned` 下的 URL 行为。
- [ ] 单测：覆盖 auth middleware 对公开短链 route 放行，对其他 `/api/*` 仍要求 bearer。
- [ ] 单测：覆盖 file access route 的 invalid/expired/tampered/notFound/objectMissing 成功和错误响应。
- [ ] 回归：运行 plugin repo 局部测试，至少包含 `remote-file-storage.repo` 相关测试、`env/index.test.ts`、Hono auth/route 测试。
- [ ] 构建：运行 `pnpm typecheck` 或至少 `pnpm --filter @fastgpt-plugin/server build`。

### PR2 可选：主项目上传插件包协议升级

- [ ] 先新增设计文档，不直接实现。
- [ ] 评估是否真的需要绕过主项目 multipart 中转。
- [ ] 设计 `create upload session -> PUT upload URL -> complete parse` 三段式 API。
- [ ] 修改 `sdk/client.uploadPlugin()`，保持外部函数签名尽量不变。
- [ ] 修改主项目 `projects/app/src/pages/api/core/plugin/admin/pkg/upload.ts`，避免一次性读全量文件进内存或明确限制。
- [ ] 设计临时上传对象 TTL、失败清理和 complete 幂等。
- [ ] 补齐取消/重试/并发上传语义。

### PR3 可选：工具生成文件回传链路验证

- [ ] 不改 plugin server 上传逻辑。
- [ ] 在主项目确认 `/api/invoke/fileUpload` 返回的 `url` 在无 external endpoint 时是短链。
- [ ] 在 plugin repo `InvokeManager.uploadFile()` 测试中补充对 `accessURL` 透传的断言，避免未来把主项目错误包装掉。

## 13. 待确认问题

1. plugin server 第一版默认模式选“保守默认”还是“短链优先”？
2. `FILE_ACCESS_BASE_URL` 在部署中是否已有等价变量？如果已有，应复用现有命名，避免新增重复配置。
3. 是否需要第一版实现 `short-redirect`？如果测试环境主要关注短链长度和 AI 引用错误率，可以先只做 `short-proxy`。
4. public bucket 当前是否必须保持公共读？如果短链 proxy 成为默认，public bucket 可以继续公共读以兼容旧 URL，但新签发 URL 不依赖它。
5. plugin server 是否有独立域名和 HTTPS？`installWithUrl` 的 URL fetcher 生产默认只允许 HTTPS，这会影响用 plugin server 短链互相安装插件包的场景。
