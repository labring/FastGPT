# S3 短链 SDK Wrapper 设计

## 0. 文档标识

- 任务前缀：`s3-shortlink-sdk-wrapper`
- 文档文件名：`shortlink-sdk-wrapper.md`
- 更新时间：2026-07-07
- 推荐 PR：短链 PR1 合并并稳定后单独做 SDK 抽取 PR
- 优先级：P1

## 1. 背景

PR1 已经把 FastGPT 内部的 S3 proxy 上传/下载链接改成短链：

```text
/api/system/file/d/<aliasId>.<expMinute36>.<sig>
/api/system/file/u/<shortToken>
```

当前实现位于 `packages/service/common/s3/accessLink`，依赖：

1. `serviceEnv.FILE_TOKEN_KEY` 作为 HMAC secret。
2. `serviceEnv.FILE_DOMAIN` / `FE_DOMAIN` / `NEXT_PUBLIC_BASE_URL` 构造 FastGPT 文件访问路由。
3. Mongoose model 保存 download alias 与 upload session。
4. Next.js API route 和 proxy handler 完成 HTTP 上传/下载代理。

如果其他服务也需要生成同样的短链，不能让它们重新实现 HMAC、TTL bucket、alias 去重、upload token hash、错误语义等逻辑，否则会出现协议漂移和安全边界不一致。

## 2. 核心判断

短链逻辑分成三层：

| 层级 | 职责 | 是否适合进 SDK |
|---|---|---|
| Storage adapter | 上传、下载、删除对象，生成厂商 presigned URL | 已在 `@fastgpt-sdk/storage` |
| Access link core | HMAC 签名、alias key、TTL bucket、upload token hash、状态机 | 适合 SDK 化 |
| FastGPT runtime adapter | Mongoose 存储、serviceEnv、Next.js route、proxy 响应、业务鉴权 | 不适合 SDK 化 |

因此不建议把当前 `packages/service/common/s3/accessLink` 原样搬到 `sdk/storage`。正确方向是抽出一个**无 FastGPT runtime 依赖**的 wrapper core，由 FastGPT service 提供 adapter。

## 3. 设计目标

1. 其他服务不需要重新实现短链协议。
2. SDK core 不依赖 Mongoose、Next.js、FastGPT `serviceEnv`、`@fastgpt/service`。
3. 短链协议只有一个实现来源，FastGPT service 只是接入 Mongo 和路由。
4. 支持两种复用模式：
   - 同一信任域服务直接复用 SDK core + 自己的 store adapter。
   - 非同一信任域服务通过 FastGPT 内部 API 申请短链，不直接写 FastGPT Mongo。
5. 不改变短链 bearer URL 的业务授权模型：调用方在签发前必须完成 objectKey 归属校验。

## 4. 非目标

1. 不把业务鉴权放进 SDK。SDK 不知道 team/app/dataset/chat 权限。
2. 不把 Next.js proxy handler 放进 SDK。HTTP 框架和响应流处理仍由应用层负责。
3. 不要求所有服务共享 FastGPT Mongo。共享 Mongo 是 library mode 的前提，不是强制模式。
4. 不调整 PR2 上传文件类型校验。
5. 不调整 PR3 ChatBox 上传 abort 行为。

## 5. 推荐位置

推荐先放在 `@fastgpt-sdk/storage` 的子路径导出中：

```text
@fastgpt-sdk/storage/access-link
```

理由：

1. 短链是对象存储访问层能力，和 `IStorage` 类型天然相关。
2. 当前 workspace 已有 `sdk/storage` 构建、发布和测试链路，落地成本低。
3. 使用子路径导出可以避免污染 root API：普通对象存储用户继续只用 `@fastgpt-sdk/storage`。
4. 如果后续 access-link 复杂度明显膨胀，再拆成独立包 `@fastgpt-sdk/file-access`。

不建议直接从 root 导出：

```ts
import { createS3AccessLinkService } from '@fastgpt-sdk/storage';
```

建议使用显式子路径：

```ts
import { createS3AccessLinkService } from '@fastgpt-sdk/storage/access-link';
```

## 6. SDK Core 边界

SDK core 只接收显式依赖：

```ts
type CreateS3AccessLinkServiceOptions = {
  secret: string;
  routes: {
    buildDownloadUrl: (signedAlias: string) => string;
    buildUploadUrl: (token: string) => string;
  };
  stores: {
    downloadAlias: S3DownloadAliasStore;
    uploadSession: S3UploadSessionStore;
  };
  clock?: () => Date;
  idGenerator?: {
    aliasId: () => string;
    uploadToken: () => string;
  };
};
```

SDK core 导出：

```ts
type S3AccessLinkService = {
  createDownloadUrl(params: CreateS3DownloadAccessUrlParams): Promise<string>;
  verifyDownloadAlias(signedAlias: string): Promise<S3ProxyDownloadPayload>;
  revokeDownloadAlias(params: RevokeS3DownloadAliasParams): Promise<void>;
  deleteDownloadAliasByObject(params: DeleteS3DownloadAliasByObjectParams): Promise<void>;
  deleteDownloadAliasByObjects(params: DeleteS3DownloadAliasByObjectsParams): Promise<void>;

  createUploadUrl(params: CreateS3UploadAccessUrlParams): Promise<string>;
  verifyUploadToken(token: string): Promise<S3ProxyUploadPayload>;
  revokeUploadToken(token: string): Promise<void>;
};
```

SDK core 不导出任何 FastGPT route 常量，也不读取环境变量。

### 6.1 更具体的实现形态

SDK core 本质上是一个 factory。它不持有任何全局状态，只把调用方传入的依赖闭包进 service：

```ts
export const createS3AccessLinkService = (options: CreateS3AccessLinkServiceOptions) => {
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? createDefaultIdGenerator();
  const crypto = createS3AccessLinkCrypto({ secret: options.secret });

  return {
    createDownloadUrl: createDownloadUrlHandler({ ...options, clock, idGenerator, crypto }),
    verifyDownloadAlias: verifyDownloadAliasHandler({ ...options, clock, crypto }),
    revokeDownloadAlias: revokeDownloadAliasHandler({ ...options, clock }),
    deleteDownloadAliasByObject: deleteDownloadAliasByObjectHandler({ ...options }),
    deleteDownloadAliasByObjects: deleteDownloadAliasByObjectsHandler({ ...options }),
    createUploadUrl: createUploadUrlHandler({ ...options, clock, idGenerator, crypto }),
    verifyUploadToken: verifyUploadTokenHandler({ ...options, clock, crypto }),
    revokeUploadToken: revokeUploadTokenHandler({ ...options, clock, crypto })
  };
};
```

默认实现只依赖 Node 标准库：

1. `node:crypto`：HMAC、token hash、random bytes、constant-time compare。
2. 原生 `Date`：TTL bucket 和过期判断。
3. 不引入 `date-fns`、`nanoid`、Mongoose、Next.js、FastGPT env。
4. 不强制引入 `zod`。SDK 可用轻量 runtime guard；FastGPT service adapter 保留当前 zod schema 作为 API/DB 边界校验。

### 6.2 Download 状态机

`createDownloadUrl(params)` 的确定流程：

```text
输入 bucketName/objectKey/expiredTime/filename/responseContentType
  -> now = clock()
  -> expiresAt = 向上归一到 TTL bucket
  -> expMinute36 = encodeUnixMinute(expiresAt)
  -> aliasKey = HMAC(secret, stableJson(bucketName/objectKey/filename/responseContentType))
  -> store.findByAliasKey(aliasKey)
  -> 不存在则 store.create(aliasId, aliasKey, payload, purgeAt)
     -> 遇到 duplicate_alias_key 则重新 findByAliasKey(aliasKey)
  -> 仅当现有 purgeAt 不足以覆盖新链接过期时间与安全窗口时 store.touchLease(...)
  -> sig = HMAC(secret, `s3-download:v1:${aliasId}:${expMinute36}`).slice(0, signatureLength)
  -> routes.buildDownloadUrl(`${aliasId}.${expMinute36}.${sig}`)
```

`verifyDownloadAlias(signedAlias)` 的确定流程：

```text
输入 signedAlias
  -> parse aliasId/expMinute36/sig
  -> expiresAt = decodeUnixMinute(expMinute36)
  -> 如果 expiresAt <= now，直接抛 expired，不查 store
  -> expectedSig = HMAC(secret, signingInput)
  -> constant-time compare
  -> store.findByAliasId(aliasId)
  -> 不存在：download_alias_not_found
  -> disabledAt 存在：download_alias_revoked
  -> 返回 bucketName/objectKey/filename/responseContentType
```

这里最重要的是：**URL 过期和签名校验必须发生在 store 查询前**。这样错误链接、过期链接不会给 Mongo 或其他 store 制造压力。

### 6.3 Upload 状态机

`createUploadUrl(params)` 的确定流程：

```text
输入 bucketName/objectKey/expiredTime/maxSize/uploadConstraints/metadata
  -> token = randomUrlSafeToken()
  -> tokenHash = HMAC(secret, token)
  -> store.create(tokenHash, payload, expiresAt)
  -> routes.buildUploadUrl(token)
```

`verifyUploadToken(token)` 的确定流程：

```text
输入 token
  -> 校验 token 基础格式
  -> tokenHash = HMAC(secret, token)
  -> store.findByTokenHash(tokenHash)
  -> 不存在：upload_session_not_found
  -> revokedAt 存在：upload_session_revoked
  -> expiresAt <= now：upload_session_expired
  -> usedAt 存在且策略为 once：upload_session_used
  -> 按策略 store.markUsed(tokenHash, usedAt)
  -> 返回 bucketName/objectKey/maxSize/uploadConstraints/metadata
```

上传这里建议 SDK 支持显式策略：

```ts
type UploadSessionUsePolicy = 'allow-retry' | 'mark-used' | 'reject-used';
```

策略语义：

| 策略 | 行为 |
|---|---|
| `allow-retry` | 不写 `usedAt`，允许重复校验同一个 upload token |
| `mark-used` | 每次校验后写 `usedAt`，但不拒绝二次校验 |
| `reject-used` | 首次校验后写 `usedAt`，后续校验直接拒绝 |

FastGPT 当前行为更接近 `mark-used`：后端代理一旦校验 upload token，就写 `usedAt`，但不拒绝二次校验。是否切到 `reject-used` 需要在 PR2/上传 abort 讨论里结合重试语义再决定，所以 SDK 不应该把这个策略写死。

### 6.4 Store duplicate 处理

SDK core 需要定义 store duplicate 的统一语义，而不是识别 Mongo `code === 11000`：

```ts
export class S3AccessLinkError extends Error {
  constructor(
    readonly code: S3AccessLinkErrorCode,
    options?: { cause?: unknown }
  ) {
    super(code);
    this.cause = options?.cause;
  }
}
```

Mongo adapter 负责把 Mongo duplicate key 转成：

```ts
throw new S3AccessLinkError('duplicate_alias_key', { cause: error });
```

SDK `createDownloadUrl` 捕获 `duplicate_alias_key` 后只做一件事：重新 `findByAliasKey(aliasKey)`。这样同一套 core 可以用于 Mongo、Postgres、Redis 或其他 KV store。

### 6.5 FastGPT Adapter 实例化

FastGPT service 侧只需要创建一个实例：

```ts
const fileBaseUrl = `${serviceEnv.FILE_DOMAIN || serviceEnv.FE_DOMAIN || ''}${serviceEnv.NEXT_PUBLIC_BASE_URL}`;

const s3AccessLinkService = createS3AccessLinkService({
  secret: serviceEnv.FILE_TOKEN_KEY,
  routes: {
    buildDownloadUrl: (signedAlias) => `${fileBaseUrl}/api/system/file/d/${signedAlias}`,
    buildUploadUrl: (token) => `${fileBaseUrl}/api/system/file/u/${token}`
  },
  stores: {
    downloadAlias: mongoS3DownloadAliasStore,
    uploadSession: mongoS3UploadSessionStore
  },
  uploadSessionUsePolicy: 'mark-used'
});

export const createS3DownloadAccessUrl = s3AccessLinkService.createDownloadUrl;
export const verifyS3DownloadAccess = s3AccessLinkService.verifyDownloadAlias;
export const createS3UploadAccessUrl = s3AccessLinkService.createUploadUrl;
export const verifyS3UploadSessionToken = s3AccessLinkService.verifyUploadToken;
```

这样 `S3BaseBucket`、dataset、quote、proxy route 都继续引用 `@fastgpt/service/common/s3/accessLink`，不直接感知 SDK。

## 7. Store Port 设计

### 7.1 Download Alias Store

```ts
type S3DownloadAliasStore = {
  findByAliasKey(aliasKey: string): Promise<S3DownloadAliasRecord | null>;
  findByAliasId(aliasId: string): Promise<S3DownloadAliasRecord | null>;
  create(record: CreateS3DownloadAliasRecord): Promise<S3DownloadAliasRecord>;
  touchLease(params: { aliasId: string; purgeAt: Date; lastIssuedAt: Date }): Promise<void>;
  disableByAliasId(params: { aliasId: string; disabledAt: Date }): Promise<void>;
  deleteByObject(params: { bucketName: string; objectKey: string }): Promise<void>;
  deleteByObjects(params: { objects: { bucketName: string; objectKey: string }[] }): Promise<void>;
};
```

约束：

1. `aliasId` 必须唯一。
2. `aliasKey` 必须唯一。
3. `purgeAt` 应由 store 所属数据库配置 TTL 清理。
4. 并发创建同一 `aliasKey` 时，store 可以抛 duplicate error，SDK core 负责重查。

### 7.2 Upload Session Store

```ts
type S3UploadSessionStore = {
  create(record: CreateS3UploadSessionRecord): Promise<S3UploadSessionRecord>;
  findByTokenHash(tokenHash: string): Promise<S3UploadSessionRecord | null>;
  markUsed(params: { tokenHash: string; usedAt: Date }): Promise<void>;
  revoke(params: { tokenHash: string; revokedAt: Date }): Promise<void>;
};
```

约束：

1. SDK core 只把 `tokenHash` 传给 store，不把 upload token 明文落库。
2. `expiresAt` 应由 store 所属数据库配置 TTL 清理。
3. `verifyUploadToken` 是否 mark used 需要由 SDK option 控制，避免不同业务对一次性上传和可重试上传的期望不一致。

## 8. 文件组织建议

### 8.1 SDK 文件

```text
sdk/storage/src/access-link/
  constants.ts        # 协议常量：签名版本、默认长度、TTL bucket
  crypto.ts           # HMAC、constant-time compare、hash token
  download.ts         # download alias 签发与校验状态机
  upload.ts           # upload session 签发与校验状态机
  service.ts          # createS3AccessLinkService 聚合入口
  stores.ts           # Store port 类型
  types.ts            # 参数、record、payload 类型
  errors.ts           # SDK 内部错误码
  testing.ts          # memory store 和固定 clock/id 便于测试
  index.ts            # 子路径统一导出
```

`sdk/storage/package.json` 增加子路径：

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./access-link": {
      "import": "./dist/access-link/index.js",
      "types": "./dist/access-link/index.d.ts"
    }
  }
}
```

### 8.2 FastGPT Service Adapter 文件

```text
packages/service/common/s3/accessLink/
  index.ts
  service.ts                  # 实例化 SDK service，并导出 FastGPT 现有函数
  error.ts                    # SDK 错误到 FastGPT 错误的映射
  downloadAlias/
    schema.ts                 # Mongoose schema
    store.ts                  # 实现 S3DownloadAliasStore
  uploadSession/
    schema.ts                 # Mongoose schema
    store.ts                  # 实现 S3UploadSessionStore
```

`packages/service/common/s3/buckets/base.ts` 继续只调用 service adapter：

```ts
await createS3DownloadAccessUrl(...);
await createS3UploadAccessUrl(...);
```

这样 PR1 的业务调用点不需要知道 SDK 细节。

## 9. 其他服务的两种复用模式

### 9.1 Library Mode

适用条件：

1. 服务和 FastGPT 在同一信任域。
2. 服务能访问同一份 Mongo alias/session 集合，或有自己的等价持久化实现。
3. 服务使用同一个 `FILE_TOKEN_KEY`。
4. 服务的短链最终由同一个 route host 处理，或 route builder 指向自己的文件代理服务。

调用方式：

```ts
const accessLink = createS3AccessLinkService({
  secret: process.env.FILE_TOKEN_KEY!,
  routes: {
    buildDownloadUrl: (signedAlias) => `${fileBaseUrl}/api/system/file/d/${signedAlias}`,
    buildUploadUrl: (token) => `${fileBaseUrl}/api/system/file/u/${token}`
  },
  stores: {
    downloadAlias: mongoDownloadAliasStore,
    uploadSession: mongoUploadSessionStore
  }
});
```

优点：

1. 无额外网络调用。
2. 性能最好。
3. 可独立部署自己的文件代理。

风险：

1. 所有服务必须严格一致地做业务鉴权。
2. 共享 secret 和 Mongo 写权限扩大了信任边界。
3. 多服务版本不一致时，协议迁移要做兼容。

### 9.2 Gateway Mode

适用条件：

1. 服务不应该直接访问 FastGPT Mongo。
2. 服务不应该持有 `FILE_TOKEN_KEY`。
3. 文件下载最终仍由 FastGPT 统一承载。

调用方式：

```text
Other Service
  -> FastGPT internal file-access API
  -> FastGPT 完成鉴权/签发/写 alias
  -> 返回短链
```

优点：

1. 只有 FastGPT 持有短链 secret 和 alias/session 写权限。
2. 鉴权、审计和限流集中。
3. 其他服务不需要跟随短链协议变化。

风险：

1. 多一次内部 API 调用。
2. FastGPT 成为短链签发路径的中心依赖。
3. 需要设计内部 API 的调用方身份、资源授权和限流。

判断标准：

| 场景 | 推荐模式 |
|---|---|
| FastGPT app 内部模块 | 继续直接调用 service adapter |
| 同仓库后端服务，部署在同一信任域 | Library Mode |
| 独立微服务，不应访问 FastGPT Mongo/secret | Gateway Mode |
| 第三方服务或插件市场 | Gateway Mode |

## 10. 为什么不能只把函数复制到 SDK

仅复制 `signS3DownloadAlias`、`buildS3DownloadAliasKey` 这类函数不够，原因：

1. download alias 的正确性依赖 `aliasKey` 唯一索引、并发创建兜底、`purgeAt` lease 推进。
2. upload session 的正确性依赖 token hash、过期、撤销、使用状态。
3. 错误语义要稳定，否则上游无法判断是 403、404、413 还是 500。
4. URL builder 必须和实际文件代理 route 一致。

因此 SDK 应该抽的是“状态机 + port”，不是几个散落工具函数。

## 11. 错误设计

SDK core 使用稳定错误码：

```ts
type S3AccessLinkErrorCode =
  | 'invalid_signed_alias'
  | 'expired_signed_alias'
  | 'invalid_signed_alias_signature'
  | 'download_alias_not_found'
  | 'download_alias_revoked'
  | 'invalid_upload_token'
  | 'upload_session_not_found'
  | 'upload_session_expired'
  | 'upload_session_revoked'
  | 'upload_session_used'
  | 'duplicate_alias_key'
  | 'store_unavailable';
```

FastGPT adapter 负责映射：

| SDK 错误 | FastGPT HTTP/API 语义 |
|---|---|
| invalid/expired/revoked/not_found download alias | `ERROR_ENUM.unAuthFile` / 403 |
| upload session expired/revoked/not_found | `ERROR_ENUM.unAuthFile` / 403 |
| upload session used | 409 或 403，需要按上传重试策略定 |
| store unavailable | 500，并记录服务端日志 |

原则：

1. SDK 错误不直接暴露给用户。
2. proxy route 不把预期错误包装成 500。
3. store 层错误必须保留 cause，方便服务端排查。

## 12. 迁移方案

建议分两步：

### Step 1：SDK Core 抽取，不改外部行为

1. 在 `sdk/storage/src/access-link` 实现 core。
2. 使用 memory store 补 SDK 单测。
3. 将 `packages/service/common/s3/accessLink` 改为调用 SDK core。
4. 保持现有 FastGPT 导出函数名不变：
   - `createS3DownloadAccessUrl`
   - `verifyS3DownloadAccess`
   - `createS3UploadAccessUrl`
   - `verifyS3UploadSessionToken`
5. 现有业务调用点不动。

### Step 2：可选 Gateway API

只有确认其他服务不适合共享 Mongo/secret 时，再设计内部 API：

```text
POST /api/internal/system/file/access/download
POST /api/internal/system/file/access/upload
```

这个 API 必须单独设计鉴权，不应该复用普通用户态 API key。

## 13. 验收标准

1. `@fastgpt-sdk/storage/access-link` 可以独立运行单测，不依赖 Mongo、Next.js、FastGPT env。
2. FastGPT 当前短链 URL 格式保持不变。
3. FastGPT 当前短链 Mongo schema 保持兼容，不迁移历史数据。
4. PR1 已有测试继续通过。
5. SDK memory store 测试覆盖：
   - download URL 稳定复用 alias。
   - 篡改 exp 或 sig 被拒绝。
   - expired download alias 在 store 查询前被拒绝。
   - upload token 只保存 hash。
   - expired/revoked/used upload session 被拒绝。
6. 文档明确 library mode 与 gateway mode 的安全边界。

## 14. Tasks

- [x] SDK-T1 在 `sdk/storage/src/access-link/types.ts` 定义 params、record、payload 和 service 类型。
- [x] SDK-T2 在 `sdk/storage/src/access-link/stores.ts` 定义 download alias store 与 upload session store port。
- [x] SDK-T3 在 `sdk/storage/src/access-link/crypto.ts` 实现 HMAC、base36 minute、constant-time compare、token hash。
- [x] SDK-T4 在 `sdk/storage/src/access-link/download.ts` 实现 download alias 签发、TTL bucket、校验和撤销状态机。
- [x] SDK-T5 在 `sdk/storage/src/access-link/upload.ts` 实现 upload session 签发、校验、撤销和 used 状态机。
- [x] SDK-T6 在 `sdk/storage/src/access-link/service.ts` 实现 `createS3AccessLinkService` 聚合入口。
- [x] SDK-T7 在 `sdk/storage/src/access-link/testing.ts` 实现 memory stores、固定 clock/id 测试辅助。
- [x] SDK-T8 在 `sdk/storage/package.json` 增加 `./access-link` 子路径导出。
- [x] SDK-T9 补充 `sdk/storage` access-link 单元测试。
- [x] SDK-T10 新增 `packages/service/common/s3/accessLink/downloadAlias/store.ts` 作为 SDK download alias store adapter。
- [x] SDK-T11 新增 `packages/service/common/s3/accessLink/uploadSession/store.ts` 作为 SDK upload session store adapter。
- [x] SDK-T12 将 `packages/service/common/s3/accessLink/service.ts` 改为实例化 SDK service 并保持原导出函数兼容。
- [x] SDK-T13 保持 `projects/app/src/service/common/s3/proxy.ts` 和 API route 不直接引用 SDK core，只引用 FastGPT service adapter。
- [x] SDK-T14 运行 `sdk/storage` 单测、service 短链测试和 app 文件代理测试。
