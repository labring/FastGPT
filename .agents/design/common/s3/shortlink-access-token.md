# S3 短链访问凭证设计

## 0. 文档标识

- 任务前缀：`s3-refactor-shortlink`
- 文档文件名：`shortlink-access-token.md`
- 更新时间：2026-07-03
- 推荐 PR：PR 1
- 优先级：P0

## 1. 需求背景

当前 proxy 上传/下载 URL 把 JWT 放在 path 中：

```text
/api/system/file/download/<jwt>
/api/system/file/upload/<jwt>
```

下载 JWT 包含 `objectKey/bucketName/type/exp` 等信息；上传 JWT 还包含 `maxSize/uploadConstraints/metadata`。链接很长，AI 大模型在引用或复述时容易替换、截断或重排 JWT 中的字符，导致文件无法预览或上传。

## 2. 核心判断

短链本质上是在三件事之间取舍：

1. URL 足够短，不能把完整 payload 塞回 URL。
2. 访问凭证必须有过期时间，不能因为短链而变成永久公开链接。
3. 不能让页面每次打开、列表每次读取、markdown 每次渲染都制造一条新 Mongo 文档。

因此 PR1 不建议把 download/preview 做成“每次签发一个随机 token，然后用 token hash 查询 Mongo payload 文档”。这种方案适合验证码、邀请链接、一次性魔法链接，但不适合高频图片预览。

推荐改为混合方案：

| 场景 | 推荐模型 | 原因 |
|---|---|---|
| download/preview | object alias + URL 内短 expiry + HMAC 签名 | 不为每次签发创建 token 文档，文档数接近对象数 |
| upload | 短 upload session token + Mongo TTL 文档 | 上传 payload 大且语义是一次上传会话 |

## 3. 目标

1. 新签发的 proxy 上传/下载链接改为短 URL。
2. download URL 不包含 objectKey、bucketName、长 JWT payload。
3. download 不按每次签发写 token 文档，只维护对象 alias 文档。
4. upload 使用短 session token，完整上传策略仍在服务端保存。
5. 旧 JWT 路由继续兼容，已签发旧链接在过期前可用。
6. 不改变业务授权边界。objectKey 必须在签发前由业务入口完成归属校验。

目标 URL：

```text
/api/system/file/d/<aliasId>.<expMinute36>.<sig>
/api/system/file/u/<shortToken>
```

示例长度：

```text
/api/system/file/d/R7mQG0Yh2kVxP9Za.hovs2.KuH3qfpyxW8A4FnTnaZrJw
/api/system/file/u/wZ6rm5X4l6Ygm1oDQX8JbA
```

## 4. 非目标

1. 不调整上传文件类型校验。
2. 不调整 ChatBox 上传取消逻辑。
3. 不删除 `packages/service/common/s3/security/token.ts` 中旧 JWT 校验兼容能力。
4. 不把业务权限校验下沉到通用 S3 proxy。
5. 不保证历史回答里已经过期的链接永久可访问。短链只解决链接过长和易被模型改写的问题，不改变访问凭证的过期语义。

## 5. 当前代码中的重复签发路径

当前代码里存在大量“页面打开/列表读取/markdown 渲染时重新签发预览链接”的路径，例如：

1. `replaceS3KeyToPreviewUrl` 会把 dataset/chat/temp objectKey 替换成下载 URL。
2. `presignVariablesFileUrls` 会在 chat init/outLink init 时给变量文件重新签发预览 URL。
3. `presignChatFileGetUrl` 会按需给 Chat 文件签发下载 URL。
4. `createPresignedPutUrl` 上传成功前也会返回一个 `previewUrl`。

如果 download 短链实现成“每次签发生成随机 token，并插入一条 Mongo 记录”，Mongo 文档数会随着访问次数膨胀。这个风险不能靠后续清理完全解决，因为高峰期写入压力会先出现。

## 6. download/preview 设计

### 6.1 URL 格式

```text
/api/system/file/d/<aliasId>.<expMinute36>.<sig>
```

字段含义：

| 字段 | 说明 |
|---|---|
| `aliasId` | URL-safe 随机 id，映射到 `bucketName/objectKey` |
| `expMinute36` | 过期时间，使用 unix minute 的 base36 表示 |
| `sig` | HMAC-SHA256 签名截断后 base64url 编码 |

签名内容：

```ts
const signingInput = `s3-download:v1:${aliasId}:${expMinute36}`;
const sig = hmacSha256Base64Url(serviceEnv.FILE_TOKEN_KEY, signingInput).slice(0, 22);
```

设计原因：

1. URL 中只有 alias、短过期时间和签名，不出现 objectKey。
2. 过期时间在 URL 中，过期请求可以先拒绝，不必查 Mongo。
3. HMAC 能防止用户篡改 `expMinute36`。
4. Mongo 不存每次签发的 token，因此不存在“签发次数等于文档数”的问题。

### 6.2 alias 文档

`packages/service/common/s3/accessLink/downloadAlias/schema.ts`

```ts
export type S3DownloadAliasType = {
  _id: string;
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
};
```

字段说明：

| 字段 | 用途 |
|---|---|
| `aliasId` | 短 URL 中的资源 id，唯一索引 |
| `aliasKey` | `bucketName/objectKey/filename/responseContentType` 的 HMAC，唯一索引，用于签发时去重 |
| `bucketName/objectKey` | S3 实际读取目标 |
| `filename/responseContentType` | 下载响应的稳定变体参数 |
| `lastIssuedAt` | 最近一次签发时间，只做观测和低频更新 |
| `purgeAt` | alias 文档清理时间，TTL 索引 |
| `disabledAt` | 撤销 alias，撤销后所有该对象 alias 的下载链接失效 |

建议索引：

```ts
S3DownloadAliasSchema.index({ aliasId: 1 }, { unique: true });
S3DownloadAliasSchema.index({ aliasKey: 1 }, { unique: true });
S3DownloadAliasSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
```

### 6.3 签发流程

```text
createS3DownloadAccessUrl
  -> 计算 aliasKey
  -> findOne(aliasKey)
  -> 不存在则创建 aliasId
  -> 计算 expMinute36
  -> 用 $max 更新 purgeAt，确保 alias 至少保留到签发链接过期之后
  -> 返回 /api/system/file/d/<aliasId>.<expMinute36>.<sig>
```

重点：

1. 同一个 `bucketName/objectKey/filename/responseContentType` 只会有一个 alias 文档。
2. 页面重复打开只会复用 alias，不会新建 token 文档。
3. `expMinute36` 可以按时间桶取整，减少 URL 抖动和 `purgeAt` 更新频率。
4. 并发创建同一个 alias 时，用 `aliasKey` 唯一索引兜底；遇到 duplicate key 后重新查询即可。

### 6.4 过期时间分桶

URL 里有 `expMinute36`，所以即使每次签发的过期时间不同，也不会产生新文档。但分桶仍然有价值：

1. 减少同一页面反复渲染时 URL 变化。
2. 减少 `$max(purgeAt)` 更新频率。
3. 提升浏览器、CDN、前端 memo 的命中概率。

建议规则：

| requested TTL | exp 取整粒度 | 说明 |
|---|---|---|
| <= 2 小时 | 5 到 15 分钟 | 普通预览链接 |
| <= 24 小时 | 30 到 60 分钟 | chat/fileSelect 预览 |
| > 24 小时 | 1 天 | dataset 引用、导出、长上下文引用 |

取整方向使用向上取整，保证返回链接不会短于调用方请求的 TTL。

### 6.5 验证流程

```text
handle /api/system/file/d/[signedAlias]
  -> parse aliasId/expMinute36/sig
  -> 检查 expMinute36 是否过期，过期直接拒绝
  -> 重新计算 HMAC，constant-time 对比 sig
  -> 按 aliasId 查询 Mongo alias
  -> 检查 disabledAt
  -> 读取 bucketName/objectKey 并代理输出 stream
```

这个流程把无效或过期请求挡在 Mongo 查询之前，只让签名正确且未过期的请求进入 alias 查询。

### 6.6 清理策略

这里不要试图判断“短链是不是不再使用了”。从第一性原理看，系统无法知道一个 bearer URL 未来还会不会被用户、浏览器缓存、模型回答、第三方页面再次访问。能可靠判断的只有：

1. 这个 URL 是否已经过期。
2. 这个 alias 是否被主动撤销。
3. 这个 alias 是否已经超过保留时间。

因此清理策略是 lease-based，而不是 usage-based：

| 对象 | 清理条件 | 说明 |
|---|---|---|
| download URL | `expMinute36 < now` 后自然失效 | URL 失效不需要删 DB，因为没有 per-URL 文档 |
| download alias 文档 | `purgeAt <= now` 由 Mongo TTL 删除 | `purgeAt` 至少晚于最后签发链接的过期时间 |
| revoked alias | `disabledAt` 后立即拒绝访问 | 可保留到 `purgeAt` 由 TTL 清理 |
| S3 object | 沿用现有 `s3_ttls` 和删除队列 | alias 不负责对象生命周期 |

`purgeAt` 建议计算：

```ts
const purgeAt = addHours(expiredAtFromUrl, 24);
```

签发时使用 `$max: { purgeAt }`，这样：

1. alias 不会在已签发 URL 过期前被 TTL 删除。
2. 如果对象长期没人再签发，最后一个链接过期后 alias 会自动清理。
3. 如果对象长期频繁被查看，只有同一个 alias 文档的 `purgeAt` 被推进，不会产生新文档。

不要用 `lastUsedAt` 来决定删除，也不要访问一次就续期 URL。否则泄漏链接可能因为正常页面访问而间接延长有效期，安全语义比当前 JWT 更弱。

### 6.7 和对象删除的关系

alias 文档不应该成为 S3 对象生命周期的主状态源：

1. 如果对象被删除但 alias 还没 TTL 清理，请求会在读取 S3 时失败。
2. `S3BaseBucket.removeObject` 和删除队列可以 best-effort 删除对应 alias，减少孤儿 alias。
3. 即使 best-effort 删除遗漏，`purgeAt` 仍会兜底清理 alias 文档。

PR1 不要求一次性覆盖所有历史删除路径，但需要把 `deleteDownloadAliasByObject({ bucketName, objectKey })` 作为公共函数放好，后续删除链路可以逐步接入。

### 6.8 download alias 文档生命周期

| 动作 | 触发时机 | DB 行为 |
|---|---|---|
| 插入 | 第一次为某个 `bucketName/objectKey/filename/responseContentType` 签发 download URL | 创建 alias 文档，写入 `aliasId/aliasKey/bucketName/objectKey/purgeAt` |
| 复用 | 后续再次为同一个资源变体签发 download URL | 不插入新文档，只复用已有 `aliasId` |
| 延长保留 | 新签发 URL 的过期时间晚于当前 `purgeAt` 保护范围 | 用 `$max` 推进 `purgeAt`，避免已签发 URL 还没过期时 alias 被 TTL 删除 |
| 主动撤销 | 管理操作或安全事件需要让 alias 立即失效 | 写入 `disabledAt`，访问立即拒绝，文档仍可等 `purgeAt` TTL 清理 |
| 主动删除 | S3 对象被删除、迁移或确认不再可访问 | best-effort 删除对应 alias 文档 |
| 自动清理 | `purgeAt <= now` | Mongo TTL index 自动删除文档 |

注意：Mongo TTL 删除不是实时语义，它由 MongoDB TTL monitor 异步执行，通常会有分钟级延迟。因此访问入口仍必须检查 `expMinute36`、签名和 `disabledAt`，不能依赖“文档已被删”来保证过期拒绝。

## 7. upload 设计

upload URL 仍然使用短随机 token：

```text
/api/system/file/u/<shortToken>
```

原因：

1. 上传 payload 包含 `maxSize/uploadConstraints/metadata`，URL 内不适合承载。
2. 上传 URL 是一次上传会话，默认 10 分钟左右，天然适合 TTL session。
3. upload token 不应按 objectKey 复用，否则可能引入重复 PUT、覆盖对象、策略变更不生效等问题。

upload session 文档：

```ts
export type S3UploadSessionType = {
  _id: string;
  tokenHash: string;
  bucketName: string;
  objectKey: string;
  maxSize: number;
  uploadConstraints: UploadConstraints;
  metadata?: Record<string, string>;
  createTime: Date;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
};
```

建议索引：

```ts
S3UploadSessionSchema.index({ tokenHash: 1 }, { unique: true });
S3UploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

DB 中只存 hash，不存明文 token：

```ts
const hashS3UploadToken = (token: string) =>
  createHmac('sha256', serviceEnv.FILE_TOKEN_KEY).update(token).digest('hex');
```

### 7.1 upload session 文档生命周期

| 动作 | 触发时机 | DB 行为 |
|---|---|---|
| 插入 | 调用 `createPresignedPutUrl` 生成上传 URL | 创建 upload session 文档，保存 `tokenHash/bucketName/objectKey/maxSize/uploadConstraints/metadata/expiresAt` |
| 访问 | 前端 PUT 到 `/api/system/file/u/<shortToken>` | 按 `tokenHash` 查询 session，校验过期、撤销、size 和上传策略 |
| 标记使用 | 上传请求通过基础校验或写入完成 | 写入 `usedAt`，用于审计和排查；不依赖它清理 |
| 主动撤销 | 前端取消上传、管理操作或安全事件 | 写入 `revokedAt`，后续请求立即拒绝 |
| 自动清理 | `expiresAt <= now` | Mongo TTL index 自动删除文档 |

upload session 的清理可以依赖 `expiresAt`，因为它是短生命周期上传会话；即使 TTL monitor 延迟，访问入口也会显式校验 `expiresAt` 和 `revokedAt`。

## 8. DB 压力分析

### 8.1 签发路径

download 签发不再写 per-token 文档：

```text
文档数 ~= distinct(bucketName, objectKey, filename, responseContentType)
```

重复打开页面时，最多命中同一个 alias 文档，并低频推进 `purgeAt`。

upload 签发仍然写 session 文档：

```text
文档数 ~= 10 分钟内真实创建的上传会话数
```

### 8.2 访问路径

download 访问：

1. 过期或篡改 URL：只做本地 HMAC/时间校验，不查 Mongo。
2. 合法 URL：按 `aliasId` 做一次 indexed lookup。

upload 访问：

1. 按 `tokenHash` 做一次 indexed lookup。
2. 校验过期、撤销、size、content-type 等上传约束。

如果后续线上指标显示 download alias lookup 压力偏高，可以加一层短 TTL read-through cache：

```text
cache key: s3:download-alias:<aliasId>
cache ttl: min(expiredAt - now, 5 minutes)
```

cache 只缓存 alias payload，不缓存整个下载响应。撤销 alias 后最多存在几分钟缓存延迟；如果需要严格撤销，可以在撤销时删除 cache key。

## 9. Zod Schema 设计

Zod schema 放在 `packages/service/common/s3/accessLink/type.ts`。这些 schema 负责服务内部签发、验证和 API query 校验；实际 API 路由仍需要用 `parseApiInput` 读取 `req.query`，不要直接在 API 文件里写 `Schema.parse(req.query)`。

```ts
import z from 'zod';
import { UploadConstraintsSchema } from '../contracts/type';

const UrlSafeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const HexSha256Schema = z.string().length(64).regex(/^[a-f0-9]+$/);

export const S3AccessBucketNameSchema = z.string().min(1);
export const S3AccessObjectKeySchema = z.string().min(1);

export const S3DownloadAliasIdSchema = UrlSafeTokenSchema.min(12).max(32);
export const S3DownloadAliasKeySchema = HexSha256Schema;
export const S3DownloadExpiresMinuteSchema = z.string().min(1).max(8).regex(/^[0-9a-z]+$/);
export const S3DownloadSignatureSchema = UrlSafeTokenSchema.min(16).max(64);
export const S3SignedDownloadAliasValueSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{12,32}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{16,64}$/);

export const S3DownloadAliasSchema = z.object({
  aliasId: S3DownloadAliasIdSchema,
  aliasKey: S3DownloadAliasKeySchema,
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date(),
  lastIssuedAt: z.coerce.date(),
  purgeAt: z.coerce.date(),
  disabledAt: z.coerce.date().optional()
});
export type S3DownloadAliasType = z.infer<typeof S3DownloadAliasSchema>;

export const CreateS3DownloadAccessUrlParamsSchema = z.object({
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  expiredTime: z.coerce.date(),
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional()
});
export type CreateS3DownloadAccessUrlParams = z.infer<
  typeof CreateS3DownloadAccessUrlParamsSchema
>;

export const ParsedS3SignedDownloadAliasSchema = z.object({
  aliasId: S3DownloadAliasIdSchema,
  expMinute36: S3DownloadExpiresMinuteSchema,
  sig: S3DownloadSignatureSchema
});
export type ParsedS3SignedDownloadAlias = z.infer<typeof ParsedS3SignedDownloadAliasSchema>;

export const S3ProxyDownloadPayloadSchema = z.object({
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  filename: z.string().min(1).optional(),
  responseContentType: z.string().min(1).optional()
});
export type S3ProxyDownloadPayload = z.infer<typeof S3ProxyDownloadPayloadSchema>;
```

upload session 相关 schema 同文件定义：

```ts
export const S3UploadTokenSchema = UrlSafeTokenSchema.min(20).max(64);
export const S3UploadTokenHashSchema = HexSha256Schema;

export const S3UploadSessionSchema = z.object({
  tokenHash: S3UploadTokenHashSchema,
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  maxSize: z.number().positive(),
  uploadConstraints: UploadConstraintsSchema,
  metadata: z.record(z.string(), z.string()).optional(),
  createTime: z.coerce.date(),
  expiresAt: z.coerce.date(),
  usedAt: z.coerce.date().optional(),
  revokedAt: z.coerce.date().optional()
});
export type S3UploadSessionType = z.infer<typeof S3UploadSessionSchema>;

export const CreateS3UploadAccessUrlParamsSchema = z.object({
  bucketName: S3AccessBucketNameSchema,
  objectKey: S3AccessObjectKeySchema,
  expiredTime: z.coerce.date(),
  maxSize: z.number().positive(),
  uploadConstraints: UploadConstraintsSchema,
  metadata: z.record(z.string(), z.string()).optional()
});
export type CreateS3UploadAccessUrlParams = z.infer<typeof CreateS3UploadAccessUrlParamsSchema>;

export const S3ProxyUploadPayloadSchema = S3UploadSessionSchema.pick({
  bucketName: true,
  objectKey: true,
  maxSize: true,
  uploadConstraints: true,
  metadata: true
});
export type S3ProxyUploadPayload = z.infer<typeof S3ProxyUploadPayloadSchema>;
```

API route query schema 同文件定义，供 `parseApiInput` 使用：

```ts
export const S3DownloadAccessRouteQuerySchema = z.object({
  signedAlias: S3SignedDownloadAliasValueSchema
});

export const S3UploadAccessRouteQuerySchema = z.object({
  token: S3UploadTokenSchema
});
```

## 10. MongoDB Schema 设计

### 10.1 download alias Mongo Schema

`packages/service/common/s3/accessLink/downloadAlias/schema.ts`

```ts
import { getLogger, LogCategories } from '../../../logger';
import { getMongoModel, Schema } from '../../../mongo';
import type { S3DownloadAliasType } from '../type';

export const S3DownloadAliasCollectionName = 's3_download_aliases';

const logger = getLogger(LogCategories.INFRA.MONGO);

const S3DownloadAliasMongoSchema = new Schema({
  aliasId: {
    type: String,
    required: true,
    unique: true
  },
  aliasKey: {
    type: String,
    required: true,
    unique: true
  },
  bucketName: {
    type: String,
    required: true
  },
  objectKey: {
    type: String,
    required: true
  },
  filename: String,
  responseContentType: String,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  lastIssuedAt: {
    type: Date,
    required: true
  },
  purgeAt: {
    type: Date,
    required: true
  },
  disabledAt: Date
});

try {
  S3DownloadAliasMongoSchema.index({ aliasId: 1 }, { unique: true });
  S3DownloadAliasMongoSchema.index({ aliasKey: 1 }, { unique: true });
  S3DownloadAliasMongoSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
  S3DownloadAliasMongoSchema.index({ bucketName: 1, objectKey: 1 });
} catch (error) {
  logger.error('Failed to build S3 download alias indexes', { error });
}

export const MongoS3DownloadAlias = getMongoModel<S3DownloadAliasType>(
  S3DownloadAliasCollectionName,
  S3DownloadAliasMongoSchema
);
```

索引设计：

| 索引 | 类型 | 用途 |
|---|---|---|
| `{ aliasId: 1 }` | unique | 下载访问时按短 id 查资源 |
| `{ aliasKey: 1 }` | unique | 签发时按资源变体去重，防并发重复创建 |
| `{ purgeAt: 1 }` | TTL | 最后一个已签发 URL 过期后自动清理 alias |
| `{ bucketName: 1, objectKey: 1 }` | normal | S3 对象删除时 best-effort 清理 alias |

### 10.2 upload session Mongo Schema

`packages/service/common/s3/accessLink/uploadSession/schema.ts`

```ts
import { getLogger, LogCategories } from '../../../logger';
import { getMongoModel, Schema } from '../../../mongo';
import type { S3UploadSessionType } from '../type';

export const S3UploadSessionCollectionName = 's3_upload_sessions';

const logger = getLogger(LogCategories.INFRA.MONGO);

const S3UploadSessionMongoSchema = new Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true
  },
  bucketName: {
    type: String,
    required: true
  },
  objectKey: {
    type: String,
    required: true
  },
  maxSize: {
    type: Number,
    required: true
  },
  uploadConstraints: {
    type: Object,
    required: true
  },
  metadata: Object,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  expiresAt: {
    type: Date,
    required: true
  },
  usedAt: Date,
  revokedAt: Date
});

try {
  S3UploadSessionMongoSchema.index({ tokenHash: 1 }, { unique: true });
  S3UploadSessionMongoSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  S3UploadSessionMongoSchema.index({ bucketName: 1, objectKey: 1 });
} catch (error) {
  logger.error('Failed to build S3 upload session indexes', { error });
}

export const MongoS3UploadSession = getMongoModel<S3UploadSessionType>(
  S3UploadSessionCollectionName,
  S3UploadSessionMongoSchema
);
```

索引设计：

| 索引 | 类型 | 用途 |
|---|---|---|
| `{ tokenHash: 1 }` | unique | 上传访问时按短 token hash 查 session |
| `{ expiresAt: 1 }` | TTL | 上传 session 过期后自动清理 |
| `{ bucketName: 1, objectKey: 1 }` | normal | 排查或对象删除时定位相关 session |

## 11. 文件组织

| 文件 | 类型 | 职责 |
|---|---|---|
| `packages/service/common/s3/accessLink/type.ts` | 新增 | download alias、upload session、签发参数类型 |
| `packages/service/common/s3/accessLink/constants.ts` | 新增 | route path、签名版本、TTL bucket、purge grace |
| `packages/service/common/s3/accessLink/error.ts` | 新增 | 短链内部错误分类和对外错误映射 |
| `packages/service/common/s3/accessLink/utils.ts` | 新增 | base36 时间、HMAC、constant-time compare、URL 构造 |
| `packages/service/common/s3/accessLink/index.ts` | 新增 | 对外统一导出 accessLink 能力 |
| `packages/service/common/s3/accessLink/downloadAlias/schema.ts` | 新增 | `MongoS3DownloadAlias` 和索引 |
| `packages/service/common/s3/accessLink/downloadAlias/entity.ts` | 新增 | alias create/find/update/delete 数据访问 |
| `packages/service/common/s3/accessLink/downloadAlias/service.ts` | 新增 | download 签发、验证、撤销 |
| `packages/service/common/s3/accessLink/uploadSession/schema.ts` | 新增 | `MongoS3UploadSession` 和 TTL 索引 |
| `packages/service/common/s3/accessLink/uploadSession/entity.ts` | 新增 | upload session create/find/markUsed/revoke |
| `packages/service/common/s3/accessLink/uploadSession/service.ts` | 新增 | upload 签发、验证、撤销 |
| `projects/app/src/service/common/s3/proxy.ts` | 新增 | 下载/上传代理公共逻辑 |
| `projects/app/src/pages/api/system/file/d/[signedAlias].ts` | 新增 | 短下载入口 |
| `projects/app/src/pages/api/system/file/u/[token].ts` | 新增 | 短上传入口 |
| `projects/app/src/pages/api/system/file/download/[token].ts` | 修改 | 复用公共下载代理，保留旧 JWT |
| `projects/app/src/pages/api/system/file/upload/[token].ts` | 修改 | 复用公共上传代理，保留旧 JWT |
| `packages/service/common/s3/buckets/base.ts` | 修改 | 新签发默认返回短 URL |
| `packages/service/common/s3/queue/delete.ts` | 修改 | 删除队列执行后 best-effort 清理 download alias |

## 12. 函数组织

### 12.1 `accessLink/utils.ts`

| 函数 | 职责 |
|---|---|
| `encodeExpiresAtMinute(date)` | Date 转 base36 unix minute |
| `decodeExpiresAtMinute(value)` | base36 unix minute 转 Date |
| `resolveDownloadExpiresAt(expiredTime)` | 按 TTL bucket 向上取整 |
| `signS3DownloadAlias({ aliasId, expMinute36 })` | 生成 HMAC 签名 |
| `parseSignedS3DownloadAlias(value)` | 解析 `aliasId.exp.sig` |
| `assertS3DownloadAliasSignature(value)` | 校验过期时间和签名 |
| `generateS3AliasId()` | 生成 URL-safe alias id |
| `generateS3UploadToken()` | 生成 URL-safe upload token |
| `hashS3UploadToken(token)` | 使用 `FILE_TOKEN_KEY` 派生 upload token hash |
| `buildS3DownloadUrl(signedAlias)` | 生成 `/api/system/file/d/<signedAlias>` |
| `buildS3UploadUrl(token)` | 生成 `/api/system/file/u/<token>` |

### 12.2 `downloadAlias/entity.ts`

| 函数 | 职责 |
|---|---|
| `findS3DownloadAliasByAliasKey(aliasKey)` | 签发阶段按资源变体查 alias |
| `findS3DownloadAliasByAliasId(aliasId)` | 下载阶段按 aliasId 查 payload |
| `createS3DownloadAlias(data)` | 创建 alias |
| `touchS3DownloadAliasPurgeAt({ aliasKey, purgeAt })` | 用 `$max` 推进清理时间 |
| `disableS3DownloadAliasByAliasId(aliasId)` | 撤销 alias |
| `deleteS3DownloadAliasByObject({ bucketName, objectKey })` | 对象删除时 best-effort 清理 alias |

### 12.3 `downloadAlias/service.ts`

| 函数 | 职责 |
|---|---|
| `createS3DownloadAccessUrl(params)` | 创建或复用 alias，并返回 signed alias URL |
| `verifyS3DownloadAccess(value)` | 校验 signed alias 并返回下载 payload |
| `revokeS3DownloadAlias(aliasId)` | 撤销 alias |

函数注释要求：

1. `createS3DownloadAccessUrl` 必须说明它只承载已授权后的存储上下文，不做 app/dataset/team 权限判断。
2. `verifyS3DownloadAccess` 必须说明 URL 的过期由 `expMinute36 + HMAC` 保证，Mongo alias 只负责资源映射。

### 12.4 `uploadSession/service.ts`

| 函数 | 职责 |
|---|---|
| `createS3UploadAccessUrl(params)` | 创建 upload session 并返回短 URL |
| `verifyS3UploadSessionToken(token)` | 校验 upload token 并返回上传 payload |
| `revokeS3UploadSessionToken(token)` | 撤销 upload session |

### 12.5 `projects/app/src/service/common/s3/proxy.ts`

| 函数 | 职责 |
|---|---|
| `handleS3ProxyDownload({ req, res, payload })` | 设置 header 并输出下载 stream |
| `handleS3ProxyUpload({ req, payload })` | 校验上传流并写入 S3 |
| `parseS3ProxyContentLength(req)` | 解析 content-length |
| `buildS3UploadMetadata({ metadata, filename })` | 构造上传 metadata |
| `handleS3ProxyRouteError({ res, error })` | 把可预期文件代理错误映射为稳定 HTTP status 和业务错误响应 |

## 13. API 行为

短下载入口：

```ts
const payload = await verifyS3DownloadAccess(req.query.signedAlias);
return handleS3ProxyDownload({ req, res, payload });
```

短上传入口：

```ts
const payload = await verifyS3UploadSessionToken(req.query.token);
return handleS3ProxyUpload({ req, payload });
```

旧 JWT 入口：

1. 继续使用 `jwtVerifyS3DownloadToken` / `jwtVerifyS3UploadToken`。
2. 验证后调用同一个 proxy handler。
3. 不再复制 stream/header/upload guard 逻辑。
4. 不再导出或调用 `jwtSignS3DownloadToken` / `jwtSignS3UploadToken`，避免新代码继续签发旧 JWT。

## 14. 错误设计

### 14.1 设计原则

文件代理入口不能把所有失败都变成 500。PR1 需要把错误分为两类：

| 类型 | 处理方式 |
|---|---|
| 可预期访问错误 | 映射成稳定业务错误和 4xx HTTP status |
| 系统异常 | 记录 error 日志，返回 500，不泄露 bucket/objectKey/token |

注意：`NextAPI` 默认 catch 会用 `jsonRes(code: 500, error)` 输出错误；如果短链路由直接把 `CommonErrEnum.unAuthFile` 抛到默认 catch，业务 `statusText` 可以保留，但 HTTP status 可能仍是 500。因此 `d/[signedAlias].ts`、`u/[token].ts`、旧 `download/[token].ts` 和旧 `upload/[token].ts` 都应该在路由层捕获文件代理可预期错误，并调用 `handleS3ProxyRouteError` 写出响应。

### 14.2 内部错误分类

`packages/service/common/s3/accessLink/error.ts`

```ts
export enum S3AccessLinkErrCode {
  invalidSignedAlias = 'InvalidSignedAlias',
  expiredSignedAlias = 'ExpiredSignedAlias',
  invalidSignedAliasSignature = 'InvalidSignedAliasSignature',
  downloadAliasNotFound = 'DownloadAliasNotFound',
  downloadAliasRevoked = 'DownloadAliasRevoked',
  uploadSessionNotFound = 'UploadSessionNotFound',
  uploadSessionExpired = 'UploadSessionExpired',
  uploadSessionRevoked = 'UploadSessionRevoked'
}

export class S3AccessLinkError extends Error {
  constructor(public readonly code: S3AccessLinkErrCode) {
    super(code);
    this.name = 'S3AccessLinkError';
  }
}
```

内部错误只用于 service/entity/utils 之间传递分类，不直接作为 API 响应暴露给客户端。这样可以避免把“alias 不存在”和“签名错”暴露成可枚举资源存在性的信号。

### 14.3 对外错误映射

| 场景 | 内部错误或来源 | 对外错误 | HTTP status | 说明 |
|---|---|---|---:|---|
| signed alias 格式错误 | `invalidSignedAlias` | `CommonErrEnum.unAuthFile` | 403 | 不告诉调用方是格式错还是权限错 |
| signed alias 已过期 | `expiredSignedAlias` | `CommonErrEnum.unAuthFile` | 403 | 与旧 JWT 过期语义一致 |
| signed alias 签名错误 | `invalidSignedAliasSignature` | `CommonErrEnum.unAuthFile` | 403 | 防止篡改和枚举 |
| alias 不存在 | `downloadAliasNotFound` | `CommonErrEnum.unAuthFile` | 403 | 不泄露资源存在性 |
| alias 被撤销 | `downloadAliasRevoked` | `CommonErrEnum.unAuthFile` | 403 | 与无权访问一致 |
| S3 对象不存在 | `bucket.getFileStream` 返回空 | `CommonErrEnum.fileNotFound` | 404 | alias 合法但对象已不存在 |
| bucket 配置不存在 | `global.s3BucketMap[bucketName]` 空 | `Error('S3 bucket not found')` | 500 | 服务端配置问题，不暴露 bucketName |
| upload token 不存在 | `uploadSessionNotFound` | `CommonErrEnum.unAuthFile` | 403 | 不泄露 session 状态 |
| upload token 过期 | `uploadSessionExpired` | `CommonErrEnum.unAuthFile` | 403 | 与旧 JWT 过期语义一致 |
| upload token 被撤销 | `uploadSessionRevoked` | `CommonErrEnum.unAuthFile` | 403 | 前端 abort 后继续上传应失败 |
| 上传体超限 | `EntityTooLarge` | `EntityTooLarge` | 413 | 保持现有前端 `parseS3UploadError` 可识别 |
| 上传类型不允许 | 现有上传校验错误 | 原错误透传给 `jsonRes` | 400 | 沿用现有上传校验错误，不在 PR1 新增短链错误码 |
| 上传类型不匹配 | 现有上传校验错误 | 原错误透传给 `jsonRes` | 400 | 沿用现有上传校验错误，不在 PR1 新增短链错误码 |
| API query 校验失败 | `parseApiInput` | Zod request error | 400 | 由 `NextAPI` 的 Zod 降噪逻辑处理 |
| Method 不允许 | 路由方法校验 | `Method not allowed` | 405 | 直接 `jsonRes(code: 405, error)` 或设置 405 |

### 14.4 route 层错误响应 helper

`projects/app/src/service/common/s3/proxy.ts`

```ts
export function resolveS3ProxyErrorResponse(error: unknown): {
  httpStatus: number;
  publicError: unknown;
} {
  if (error instanceof S3AccessLinkError) {
    return {
      httpStatus: 403,
      publicError: CommonErrEnum.unAuthFile
    };
  }

  if (error === CommonErrEnum.fileNotFound) {
    return {
      httpStatus: 404,
      publicError: CommonErrEnum.fileNotFound
    };
  }

  if (error instanceof Error && error.message === 'EntityTooLarge') {
    return {
      httpStatus: 413,
      publicError: error
    };
  }

  return {
    httpStatus: 500,
    publicError: error
  };
}

export function handleS3ProxyRouteError({
  res,
  error
}: {
  res: NextApiResponse;
  error: unknown;
}) {
  const { httpStatus, publicError } = resolveS3ProxyErrorResponse(error);

  return jsonRes(res, {
    code: httpStatus,
    error: publicError
  });
}
```

这里 `code: httpStatus` 的作用是确保短链自有错误最终 HTTP status 正确；业务响应体里的 `code/statusText/message` 仍由 `ERROR_RESPONSE` 或现有错误解析逻辑生成。

上传文件类型错误继续复用现有上传校验链路：`validateUploadFile` 抛出的业务错误已经在全局 `ERROR_RESPONSE/jsonRes` 中有映射，PR1 不需要在短链模块里 import 或匹配 `S3ErrEnum`。这样可以避免把“短链鉴权错误”和“上传策略错误”耦合在一起；真正整理上传错误枚举应放到 PR2 的上传策略重构里处理。

### 14.5 抛错边界

| 模块 | 可以抛出的错误 | 不能做的事 |
|---|---|---|
| `accessLink/utils.ts` | `S3AccessLinkError` | 不返回 `undefined` 让上层猜原因 |
| `downloadAlias/service.ts` | `S3AccessLinkError`、系统异常 | 不直接 import `jsonRes` |
| `uploadSession/service.ts` | `S3AccessLinkError`、系统异常 | 不直接 import `jsonRes` |
| `projects/app/src/service/common/s3/proxy.ts` | `CommonErrEnum.fileNotFound`、`EntityTooLarge`、现有上传校验业务错误、系统异常 | 不吞 stream/upload 错误 |
| API route | 捕获错误并调用 `handleS3ProxyRouteError` | 不把可预期代理错误落到默认 500 |

### 14.6 测试要求

PR1 必须补充错误响应测试：

1. 过期 signed alias 返回 HTTP 403，`statusText=unAuthFile`。
2. 篡改 `expMinute36` 返回 HTTP 403，`statusText=unAuthFile`。
3. alias 不存在返回 HTTP 403，`statusText=unAuthFile`。
4. alias 合法但 S3 对象不存在返回 HTTP 404，`statusText=fileNotFound`。
5. upload token 不存在、过期、撤销均返回 HTTP 403，`statusText=unAuthFile`。
6. 上传超过 `maxSize` 返回 HTTP 413，并能被 `parseS3UploadError` 识别为文件过大。
7. 上传类型不允许返回 HTTP 400，并能被 `parseS3UploadError` 识别为文件类型错误。
8. 未知异常返回 HTTP 500，日志中不能输出明文 token。

## 15. 文件影响清单

### 15.1 新增文件

| 文件 | 原因 |
|---|---|
| `packages/service/common/s3/accessLink/type.ts` | Zod schema、类型推导、API query schema |
| `packages/service/common/s3/accessLink/constants.ts` | 路由常量、签名版本、TTL bucket、purge grace |
| `packages/service/common/s3/accessLink/error.ts` | 短链内部错误分类和对外映射辅助 |
| `packages/service/common/s3/accessLink/utils.ts` | HMAC 签名、base36 过期时间、短 URL 构造、token hash |
| `packages/service/common/s3/accessLink/index.ts` | 统一导出，避免外部引用子文件路径 |
| `packages/service/common/s3/accessLink/downloadAlias/schema.ts` | download alias Mongo model 和索引 |
| `packages/service/common/s3/accessLink/downloadAlias/entity.ts` | download alias 数据访问 |
| `packages/service/common/s3/accessLink/downloadAlias/service.ts` | download alias 签发、校验、撤销 |
| `packages/service/common/s3/accessLink/uploadSession/schema.ts` | upload session Mongo model 和 TTL 索引 |
| `packages/service/common/s3/accessLink/uploadSession/entity.ts` | upload session 数据访问 |
| `packages/service/common/s3/accessLink/uploadSession/service.ts` | upload session 签发、校验、撤销 |
| `projects/app/src/service/common/s3/proxy.ts` | 复用下载和上传代理逻辑，并统一代理错误响应 |
| `projects/app/src/pages/api/system/file/d/[signedAlias].ts` | 新短下载入口 |
| `projects/app/src/pages/api/system/file/u/[token].ts` | 新短上传入口 |
| `packages/service/test/common/s3/accessLink.test.ts` | download alias 和 upload session 单元测试 |
| `projects/app/test/api/system/file/accessLink.test.ts` | 新短路由和旧 JWT 兼容测试 |

### 15.2 修改文件

| 文件 | 修改点 |
|---|---|
| `packages/service/common/s3/buckets/base.ts` | `createExternalUrl(proxy)` 改为签发短 download alias URL；`createPresignedPutUrl` 改为签发短 upload session URL；`removeObject` 直接删除对象后 best-effort 删除相关 download alias |
| `packages/service/common/s3/security/token.ts` | 移除旧 JWT 签发函数，只保留旧 JWT 下载/上传校验函数，用于兼容已签发旧链接 |
| `projects/app/src/pages/api/system/file/download/[token].ts` | 旧 JWT 下载入口复用 `handleS3ProxyDownload` |
| `projects/app/src/pages/api/system/file/upload/[token].ts` | 旧 JWT 上传入口复用 `handleS3ProxyUpload` |
| `packages/service/common/s3/queue/delete.ts` | 删除对象成功后 best-effort 删除相关 download alias |

### 15.3 不修改文件

| 文件 | 原因 |
|---|---|
| `packages/service/common/s3/validation/upload.ts` | 文件类型校验属于 PR2 |
| ChatBox 上传组件相关文件 | abort 行为属于 PR3 |

## 16. Tasks

- [x] PR1-T1 新增 `accessLink/type.ts`，定义 download alias、upload session 和签发参数类型。
- [x] PR1-T2 新增 `accessLink/constants.ts`，定义短链 route、签名版本、TTL bucket 和 purge grace。
- [x] PR1-T3 新增 `accessLink/error.ts`，定义 `S3AccessLinkError`、错误码和代理错误映射约定。
- [x] PR1-T4 新增 `accessLink/utils.ts`，实现 base36 时间、HMAC 签名、签名校验、短 URL 构造。
- [x] PR1-T5 新增 `downloadAlias/schema.ts`，建立 `aliasId` 唯一索引、`aliasKey` 唯一索引和 `purgeAt` TTL 索引。
- [x] PR1-T6 新增 `downloadAlias/entity.ts`，封装 alias create/find/touch/disable/delete。
- [x] PR1-T7 新增 `downloadAlias/service.ts`，实现 `createS3DownloadAccessUrl` 和 `verifyS3DownloadAccess`。
- [x] PR1-T8 新增 `uploadSession/schema.ts`，建立 `tokenHash` 唯一索引和 `expiresAt` TTL 索引。
- [x] PR1-T9 新增 `uploadSession/entity.ts`，封装 upload session create/find/markUsed/revoke。
- [x] PR1-T10 新增 `uploadSession/service.ts`，实现 `createS3UploadAccessUrl` 与 `verifyS3UploadSessionToken`。
- [x] PR1-T11 新增 `accessLink/index.ts`，统一导出短链模块能力。
- [x] PR1-T12 抽取 `projects/app/src/service/common/s3/proxy.ts`，迁移现有下载代理公共逻辑。
- [x] PR1-T13 在同一个 proxy 文件中迁移现有上传代理公共逻辑，并实现 `handleS3ProxyRouteError`。
- [x] PR1-T14 新增 `d/[signedAlias].ts`，短下载入口用 `parseApiInput` 校验 query 后调用 signed alias 校验和代理。
- [x] PR1-T15 新增 `u/[token].ts`，短上传入口用 `parseApiInput` 校验 query 后调用 upload session 校验和代理。
- [x] PR1-T16 改造旧 `download/[token].ts` 和 `upload/[token].ts`，保留 JWT 兼容并复用 proxy。
- [x] PR1-T17 改造 `S3BaseBucket.createExternalUrl` proxy 分支，默认签发短 download alias URL。
- [x] PR1-T18 改造 `S3BaseBucket.createPresignedPutUrl`，默认签发短 upload session URL，并让 `previewUrl` 走短 download alias URL。
- [x] PR1-T19 在 `S3BaseBucket.removeObject` 和 S3 删除队列中 best-effort 接入 `deleteS3DownloadAliasByObject`。
- [x] PR1-T20 补充 signed alias 签发、复用、过期、篡改、撤销、purgeAt 推进和错误映射测试。
- [x] PR1-T21 补充 upload session 签发、校验、过期、撤销、purpose 隔离和错误映射测试。
- [x] PR1-T22 补充短下载代理、短上传代理和旧 JWT 兼容测试。
- [x] PR1-T23 运行 PR1 局部测试。

## 17. 测试

建议局部测试：

```bash
pnpm test packages/service/test/common/s3/token.test.ts
pnpm test projects/app/test/api/system/file/sourceContentType.test.ts
```

新增或扩展用例：

1. download 短 URL 不包含 JWT payload 和 objectKey。
2. 同一 objectKey 重复签发 download URL，只复用同一个 alias 文档。
3. download URL 修改 `expMinute36` 后被拒绝。
4. download URL 修改 `sig` 后被拒绝。
5. 过期 download URL 在查 Mongo 前被拒绝。
6. revoked alias 被拒绝。
7. 签发时 `purgeAt` 至少晚于 URL 过期时间。
8. upload 票据不能用于 download。
9. 过期 upload session 被拒绝。
10. DB 中只存 upload token hash，不存 upload token 明文。
11. 旧 JWT 下载和上传仍可用。
12. 可预期短链和上传错误不会被默认包装成 HTTP 500。

## 18. 验收标准

1. 新签发的 proxy 下载 URL 形如 `/api/system/file/d/<aliasId>.<expMinute36>.<sig>`。
2. 新签发的 proxy 上传 URL 形如 `/api/system/file/u/<shortToken>`。
3. 下载短 URL 长度明显短于旧 JWT URL，且不包含 objectKey。
4. 反复打开同一页面不会为同一图片持续新增 token 文档。
5. download alias 文档可通过 `purgeAt` TTL 自动清理。
6. upload session 文档可通过 `expiresAt` TTL 自动清理。
7. 旧 JWT 路由仍可用。
8. 下载和上传代理行为与改造前一致。
9. 过期、篡改、撤销、超限、文件不存在等可预期错误能被上游捕获，并返回稳定 `statusText` 和 HTTP status。
