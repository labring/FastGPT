# S3 重构 PR 拆分计划

## 0. 文档标识

- 任务前缀：`s3-refactor`
- 文档文件名：`pr-split-plan.md`
- 更新时间：2026-07-03
- 关联设计索引：`refactor-shortlink-upload-policy-chatbox-abort.md`
- PR 1 设计：`shortlink-access-token.md`
- PR 2 设计：`upload-policy-validation.md`
- PR 3 设计：`chatbox-upload-abort.md`
- 文档定位：把 S3 重构拆成 3 个可独立 review、测试、回滚的 PR

## 1. 拆分结论

建议拆成 3 个 PR：

| PR | 名称 | 优先级 | 主要收益 | 风险类型 |
|---|---|---:|---|---|
| PR 1 | S3 短链票据 | P0 | 解决模型引用长 JWT 链接时的幻觉和不可预览问题 | 后端签发与兼容 |
| PR 2 | 上传文件类型校验重构 | P1 | 支持无后缀但真实内容可识别的上传文件 | 安全策略与兼容 |
| PR 3 | ChatBox 上传 Abort | P2 | 修复移除上传占位后请求仍完成并写回的问题 | 前端状态竞态 |

推荐顺序：

1. 先做 PR 1。它解决最核心的 AI 可用性问题，并且可以基本复用现有上传/下载代理。
2. 再做 PR 2。它会改变文件类型判定语义，需要单独安全审查和测试。
3. 最后做 PR 3。它主要是前端任务状态修复，可以独立实现；如果 UX 很急，也可以和 PR 2 并行，但不要混进 PR 1。

## 2. 拆分原则

1. 每个 PR 只解决一个用户可感知问题。
2. 每个 PR 必须有独立测试和独立回滚路径。
3. PR 之间不共享半成品抽象。只有上一个 PR 合入后，下一个 PR 才复用它的稳定接口。
4. PR 1 不改文件类型策略。
5. PR 2 不改短链票据结构。
6. PR 3 不改服务端 S3 签发和校验策略，除非只是在 API wrapper 里增加 abort config。

## 3. PR 1：S3 短链票据

### 3.1 PR 目标

把新签发的 proxy 上传/下载 URL 从长 JWT 改成短 token URL，降低大模型引用链接时改写字符导致链接失效的概率。

目标 URL：

```text
/api/system/file/d/<aliasId>.<expMinute36>.<sig>
/api/system/file/u/<shortToken>
```

旧 URL 继续兼容：

```text
/api/system/file/download/<jwt>
/api/system/file/upload/<jwt>
```

### 3.2 In Scope

重要约束：当前页面读取、列表读取、markdown 渲染和 chat 初始化路径都会重新签发预览 URL，因此 PR1 不能把 download/preview 的“每次签发”实现成“每次 insert 一条 Mongo token 文档”。download/preview 使用 object alias + URL 内短 expiry + HMAC 签名；Mongo 只保存资源 alias。upload 保持短 session token，一次上传会话一条 TTL 文档。

1. 新增 download alias 模块，避免按签发次数创建 download token 文档。
2. 新增 upload session 模块，保存上传策略 payload。
3. 新增短下载、短上传代理 API。
4. 抽出现有 upload/download 代理公共逻辑。
5. `S3BaseBucket.createExternalUrl(proxy)` 改为签发短下载 URL。
6. `S3BaseBucket.createPresignedPutUrl` 改为签发短上传 URL。
7. 保留旧 JWT 验证和旧路由兼容。

### 3.3 Out of Scope

1. 不调整上传文件类型校验。
2. 不调整 ChatBox 上传取消逻辑。
3. 不改变业务授权边界。objectKey 仍必须在签发前由业务入口校验。
4. 不删除 `security/token.ts` 里的 JWT 兼容函数。

### 3.4 文件组织

| 文件 | 类型 | 职责 |
|---|---|---|
| `packages/service/common/s3/accessLink/type.ts` | 新增 | download alias、upload session、签发参数类型 |
| `packages/service/common/s3/accessLink/constants.ts` | 新增 | route path、签名版本、TTL bucket、purge grace |
| `packages/service/common/s3/accessLink/error.ts` | 新增 | 短链内部错误分类和对外错误映射 |
| `packages/service/common/s3/accessLink/utils.ts` | 新增 | base36 时间、HMAC、签名校验、短 URL 构造 |
| `packages/service/common/s3/accessLink/index.ts` | 新增 | 对外统一导出 accessLink 能力 |
| `packages/service/common/s3/accessLink/downloadAlias/schema.ts` | 新增 | `MongoS3DownloadAlias`、`aliasId` 唯一索引、`aliasKey` 唯一索引和 `purgeAt` TTL 索引 |
| `packages/service/common/s3/accessLink/downloadAlias/entity.ts` | 新增 | alias create/find/touch/disable/delete 数据访问 |
| `packages/service/common/s3/accessLink/downloadAlias/service.ts` | 新增 | download alias 签发、验证、撤销 |
| `packages/service/common/s3/accessLink/uploadSession/schema.ts` | 新增 | `MongoS3UploadSession`、`tokenHash` 唯一索引和 `expiresAt` TTL 索引 |
| `packages/service/common/s3/accessLink/uploadSession/entity.ts` | 新增 | upload session create/find/markUsed/revoke |
| `packages/service/common/s3/accessLink/uploadSession/service.ts` | 新增 | upload session 签发、验证、撤销 |
| `projects/app/src/service/common/s3/proxy.ts` | 新增 | 下载/上传代理公共逻辑 |
| `projects/app/src/pages/api/system/file/d/[signedAlias].ts` | 新增 | 短下载入口 |
| `projects/app/src/pages/api/system/file/u/[token].ts` | 新增 | 短上传入口 |
| `projects/app/src/pages/api/system/file/download/[token].ts` | 修改 | 复用公共下载代理，保留旧 JWT |
| `projects/app/src/pages/api/system/file/upload/[token].ts` | 修改 | 复用公共上传代理，保留旧 JWT |
| `packages/service/common/s3/buckets/base.ts` | 修改 | 新签发默认返回短 URL，并在直接删除对象后 best-effort 清理 alias |
| `packages/service/common/s3/queue/delete.ts` | 修改 | 删除队列执行后 best-effort 清理 alias |

### 3.5 核心函数

| 函数 | 文件 | 职责 |
|---|---|---|
| `encodeExpiresAtMinute(date)` | `accessLink/utils.ts` | Date 转 base36 unix minute |
| `signS3DownloadAlias({ aliasId, expMinute36 })` | `accessLink/utils.ts` | 生成 download HMAC 签名 |
| `assertS3DownloadAliasSignature(value)` | `accessLink/utils.ts` | 校验 signed alias 的过期时间和签名 |
| `buildS3DownloadUrl(signedAlias)` | `accessLink/utils.ts` | 生成 `/d/<aliasId>.<exp>.<sig>` 短 URL |
| `buildS3UploadUrl(token)` | `accessLink/utils.ts` | 生成 `/u/<token>` 短 URL |
| `findS3DownloadAliasByAliasKey(aliasKey)` | `downloadAlias/entity.ts` | 签发阶段按资源变体查 alias |
| `findS3DownloadAliasByAliasId(aliasId)` | `downloadAlias/entity.ts` | 下载阶段按 aliasId 查 payload |
| `touchS3DownloadAliasPurgeAt({ aliasKey, purgeAt })` | `downloadAlias/entity.ts` | 用 `$max` 推进 alias 清理时间 |
| `deleteS3DownloadAliasByObject({ bucketName, objectKey })` | `downloadAlias/entity.ts` | 对象删除时 best-effort 清理 alias |
| `createS3DownloadAccessUrl(params)` | `downloadAlias/service.ts` | 创建或复用 alias，并返回 signed alias URL |
| `verifyS3DownloadAccess(value)` | `downloadAlias/service.ts` | 校验 signed alias 并返回下载 payload |
| `createS3UploadAccessUrl(params)` | `uploadSession/service.ts` | 创建 upload session 并返回短 URL |
| `verifyS3UploadSessionToken(token)` | `uploadSession/service.ts` | 校验 upload token 并返回上传 payload |
| `handleS3ProxyDownload({ req, res, payload })` | `projects/app/src/service/common/s3/proxy.ts` | 读取对象并输出 stream |
| `handleS3ProxyUpload({ req, payload })` | `projects/app/src/service/common/s3/proxy.ts` | 校验上传流并写入对象 |
| `handleS3ProxyRouteError({ res, error })` | `projects/app/src/service/common/s3/proxy.ts` | 把可预期文件代理错误映射为稳定 HTTP status 和业务错误响应 |

### 3.6 Tasks

- [ ] PR1-T1 新增 `accessLink/type.ts`，定义 download alias、upload session 和签发参数类型。
- [ ] PR1-T2 新增 `accessLink/constants.ts`，定义短链 route、签名版本、TTL bucket 和 purge grace。
- [ ] PR1-T3 新增 `accessLink/error.ts`，定义 `S3AccessLinkError`、错误码和代理错误映射约定。
- [ ] PR1-T4 新增 `accessLink/utils.ts`，实现 base36 时间、HMAC 签名、签名校验、短 URL 构造。
- [ ] PR1-T5 新增 `downloadAlias/schema.ts`，建立 `aliasId` 唯一索引、`aliasKey` 唯一索引和 `purgeAt` TTL 索引。
- [ ] PR1-T6 新增 `downloadAlias/entity.ts`，封装 alias create/find/touch/disable/delete。
- [ ] PR1-T7 新增 `downloadAlias/service.ts`，实现 `createS3DownloadAccessUrl` 和 `verifyS3DownloadAccess`。
- [ ] PR1-T8 新增 `uploadSession/schema.ts`，建立 `tokenHash` 唯一索引和 `expiresAt` TTL 索引。
- [ ] PR1-T9 新增 `uploadSession/entity.ts`，封装 upload session create/find/markUsed/revoke。
- [ ] PR1-T10 新增 `uploadSession/service.ts`，实现 `createS3UploadAccessUrl` 与 `verifyS3UploadSessionToken`。
- [ ] PR1-T11 新增 `accessLink/index.ts`，统一导出短链模块能力。
- [ ] PR1-T12 抽取 `projects/app/src/service/common/s3/proxy.ts`，迁移现有下载代理公共逻辑。
- [ ] PR1-T13 在同一个 proxy 文件中迁移现有上传代理公共逻辑，并实现 `handleS3ProxyRouteError`。
- [ ] PR1-T14 新增 `d/[signedAlias].ts`，短下载入口用 `parseApiInput` 校验 query 后调用 signed alias 校验和代理。
- [ ] PR1-T15 新增 `u/[token].ts`，短上传入口用 `parseApiInput` 校验 query 后调用 upload session 校验和代理。
- [ ] PR1-T16 改造旧 `download/[token].ts` 和 `upload/[token].ts`，保留 JWT 兼容并复用 proxy。
- [ ] PR1-T17 改造 `S3BaseBucket.createExternalUrl` proxy 分支，默认签发短 download alias URL。
- [ ] PR1-T18 改造 `S3BaseBucket.createPresignedPutUrl`，默认签发短 upload session URL，并让 `previewUrl` 走短 download alias URL。
- [ ] PR1-T19 在 `S3BaseBucket.removeObject` 和 S3 删除队列中 best-effort 接入 `deleteS3DownloadAliasByObject`。
- [ ] PR1-T20 补充 signed alias 签发、复用、过期、篡改、撤销、purgeAt 推进和错误映射测试。
- [ ] PR1-T21 补充 upload session 签发、校验、过期、撤销、purpose 隔离和错误映射测试。
- [ ] PR1-T22 补充短下载代理、短上传代理和旧 JWT 兼容测试。
- [ ] PR1-T23 运行 PR1 局部测试。

### 3.7 测试

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

### 3.8 验收标准

1. 新签发的 proxy 下载 URL 形如 `/api/system/file/d/<aliasId>.<expMinute36>.<sig>`。
2. 新签发的 proxy 上传 URL 形如 `/api/system/file/u/<shortToken>`。
3. 下载短 URL 明显短于旧 JWT URL，且不包含 objectKey。
4. 旧 JWT 路由仍可用。
5. 下载和上传代理行为与改造前一致。
6. 反复打开同一页面不会为同一图片持续新增 token 文档。
7. download alias 文档可通过 `purgeAt` TTL 自动清理。
8. upload session 文档可通过 `expiresAt` TTL 自动清理。
9. 过期、篡改、撤销、超限、文件不存在等可预期错误能被上游捕获，并返回稳定 `statusText` 和 HTTP status。

## 4. PR 2：上传文件类型校验重构

### 4.1 PR 目标

把上传校验从“后缀优先拒绝”改为“策略 + hint + 内容检测最终裁决”，支持无后缀但真实内容可识别的文件。

### 4.2 In Scope

1. 新增 `uploadPolicy` 模块。
2. 预签名阶段不再因为 filename 缺少后缀直接拒绝。
3. 上传代理阶段根据文件内容、MIME、业务策略做最终判定。
4. Chat 上传预签 API 支持传 `contentType/size` hint。
5. ChatBox 预签时传浏览器 `file.type/file.size`。

### 4.3 Out of Scope

1. 不改短链票据结构。
2. 不改 ChatBox abort 行为。
3. 不放开所有无后缀文件。策略不允许或无法安全识别时仍拒绝。

### 4.4 文件组织

| 文件 | 类型 | 职责 |
|---|---|---|
| `packages/service/common/s3/uploadPolicy/type.ts` | 新增 | `UploadPolicy`、`FileTypeHint`、`ResolvedUploadFile` |
| `packages/service/common/s3/uploadPolicy/utils.ts` | 新增 | 扩展名、MIME、文本类、OOXML 检测窗口纯函数 |
| `packages/service/common/s3/uploadPolicy/service.ts` | 新增 | 策略构建和最终裁决 |
| `packages/service/common/s3/utils/uploadConstraints.ts` | 修改 | 缺后缀不直接拒绝 |
| `packages/service/common/s3/validation/upload.ts` | 修改 | 先内容检测，再按策略裁决 |
| `packages/service/common/s3/contracts/type.ts` | 修改 | 扩展上传策略字段 |
| `packages/global/openapi/core/chat/file/api.ts` | 修改 | Chat 预签 schema 增加 hint |
| `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts` | 修改 | 解析并传递 hint |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | 修改 | 预签时传 `file.type/file.size` |

### 4.5 核心函数

| 函数 | 文件 | 职责 |
|---|---|---|
| `createUploadPolicy({ filename, contentType, uploadConstraints })` | `uploadPolicy/service.ts` | 预签阶段生成策略 |
| `resolveUploadFile({ buffer, hint, policy })` | `uploadPolicy/service.ts` | 上传阶段解析最终文件信息 |
| `assertUploadFileAllowed({ detected, hint, policy })` | `uploadPolicy/service.ts` | 根据策略裁决是否允许 |
| `resolveExtensionForMime({ mime, allowedExtensions })` | `uploadPolicy/utils.ts` | 从 MIME 找允许扩展名 |
| `needsOfficeZipInspect(policy, filename)` | `uploadPolicy/utils.ts` | 无后缀但策略允许 OOXML 时启用大窗口 |
| `getUploadInspectBytes({ filename, uploadPolicy })` | `validation/upload.ts` | 返回需要缓冲的字节数 |
| `validateUploadFile({ buffer, filename, contentType, uploadPolicy })` | `validation/upload.ts` | 上传代理公共校验入口 |

### 4.6 Tasks

- [ ] PR2-T1 新增 `uploadPolicy/type.ts`，定义策略、hint、最终解析结果类型。
- [ ] PR2-T2 新增 `uploadPolicy/utils.ts`，迁移或封装扩展名和 MIME 纯函数。
- [ ] PR2-T3 新增 `uploadPolicy/service.ts`，实现策略构建和最终裁决。
- [ ] PR2-T4 修改 `createUploadConstraints` 或替换为 `createUploadPolicy`，缺后缀不直接拒绝。
- [ ] PR2-T5 修改 `getUploadInspectBytes`，支持由策略决定 OOXML 大窗口。
- [ ] PR2-T6 修改 `validateUploadFile`，先内容检测再按策略裁决。
- [ ] PR2-T7 Chat 预签 OpenAPI schema 增加 `contentType/size`，补字段说明和 example。
- [ ] PR2-T8 Chat 预签 API 使用 `parseApiInput` 解析新字段并传给 source 层。
- [ ] PR2-T9 ChatBox 上传预签时传入 `file.type/file.size`。
- [ ] PR2-T10 评估 Dataset/Avatar/Temp 是否同步支持 hint，并在 PR 描述中说明结果。
- [ ] PR2-T11 补充 upload policy 和 validation 测试。
- [ ] PR2-T12 运行 PR2 局部测试。

### 4.7 测试

建议局部测试：

```bash
pnpm test packages/service/test/common/s3/uploadConstraints.test.ts
pnpm test packages/service/test/common/s3/uploadValidation.test.ts
pnpm test projects/app/test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts
```

新增或扩展用例：

1. allowedExtensions 存在，filename 无后缀，预签阶段不拒绝。
2. 无后缀 PNG 内容，允许 `.png` 时通过并补 filename。
3. 无后缀 PNG 内容，只允许 `.jpg` 时拒绝。
4. 无后缀 DOCX 内容，允许 `.docx` 时通过。
5. 无后缀文本内容，允许 `.txt` 时通过。
6. 无后缀文本内容，只允许 `.pdf` 时拒绝。
7. Chat 预签 API 能把 `contentType/size` 传到 S3 source。

### 4.8 验收标准

1. 无后缀但内容可识别且策略允许的文件可以上传成功。
2. 无后缀但策略不允许的文件仍被拒绝。
3. metadata 中的最终 `originFilename/contentType` 与检测结果一致。
4. Dataset 下游读取仍能通过 metadata 获取正确 extension。

## 5. PR 3：ChatBox 上传 Abort

### 5.1 PR 目标

用户点击 ChatBox 文件上传占位的关闭按钮后，真正 abort 预签名或上传请求，并确保异步完成后不会把文件重新写回列表。

### 5.2 In Scope

1. 文件项增加稳定 `uploadId`。
2. `useFileUpload` 用 `uploadId` 管理 task map 和 AbortController。
3. `FilePreview` 删除从 index 改为 uploadId。
4. `putFileToS3` 支持 `AbortSignal`。
5. Chat 文件预签 API wrapper 支持传 cancel config。

### 5.3 Out of Scope

1. 不改 S3 短链票据。
2. 不改服务端文件类型校验。
3. 不重构整个 ChatBox。

### 5.4 文件组织

| 文件 | 类型 | 职责 |
|---|---|---|
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts` | 修改 | `UserInputFileItemType` 增加 `uploadId` |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils/uploadTask.ts` | 新增 | 上传任务纯函数 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | 修改 | upload task map、cancel、按 uploadId 写回 |
| `projects/app/src/components/core/chat/ChatContainer/components/FilePreview.tsx` | 修改 | `onRemoveFile(uploadId)` |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx` | 修改 | 传入 `cancelUploadFile` |
| `packages/web/common/file/utils.ts` | 修改 | `putFileToS3` 支持 `signal` |
| `projects/app/src/web/common/file/api.ts` | 修改 | `getUploadChatFilePresignedUrl(params, config?)` |

### 5.5 核心函数

| 函数 | 文件 | 职责 |
|---|---|---|
| `createUploadId()` | `utils/uploadTask.ts` | 生成本地上传任务 ID |
| `findFileIndexByUploadId(files, uploadId)` | `utils/uploadTask.ts` | 定位 field array index |
| `canApplyUploadResult({ files, uploadId, canceled })` | `utils/uploadTask.ts` | 判断异步结果是否可写回 |
| `isUploadAbortError(error)` | `utils/uploadTask.ts` | 识别取消错误 |
| `registerUploadTask(uploadId)` | `useFileUpload.tsx` 局部函数 | 创建 AbortController |
| `cancelUploadTask(uploadId)` | `useFileUpload.tsx` 局部函数 | 标记 canceled 并 abort |
| `updateFileByUploadId(uploadId, patch)` | `useFileUpload.tsx` 局部函数 | 安全更新文件项 |
| `cancelUploadFile(uploadId)` | `useFileUpload.tsx` 导出给 UI | 取消请求并移除占位 |

### 5.6 Tasks

- [ ] PR3-T1 `UserInputFileItemType` 增加 `uploadId`。
- [ ] PR3-T2 新增 `utils/uploadTask.ts`，实现 uploadId 定位、写回判断、abort 错误识别。
- [ ] PR3-T3 选择文件时生成 `uploadId`。
- [ ] PR3-T4 `useFileUpload` 增加 upload task map。
- [ ] PR3-T5 `useFileUpload` 增加 `cancelUploadFile(uploadId)`。
- [ ] PR3-T6 `getUploadChatFilePresignedUrl` 支持 cancel config。
- [ ] PR3-T7 `putFileToS3` 支持 `AbortSignal`。
- [ ] PR3-T8 上传进度和完成回调改为按 `uploadId` 查找当前文件。
- [ ] PR3-T9 取消后的 promise resolve/reject 不 toast、不写回。
- [ ] PR3-T10 `FilePreview` 改为 `onRemoveFile(uploadId)`。
- [ ] PR3-T11 `ChatInput` 传入 `cancelUploadFile`。
- [ ] PR3-T12 补充上传任务纯函数测试。
- [ ] PR3-T13 运行 PR3 局部测试并手测 ChatBox。

### 5.7 测试

建议局部测试：

```bash
pnpm test projects/app/test/components/core/chat/ChatContainer/ChatBox/file.test.ts
```

新增或扩展用例：

1. 排序后的 fileList 删除时，按 uploadId 删除正确文件。
2. 上传中取消会调用 AbortController.abort。
3. 取消后上传 promise resolve，不调用 updateFiles。
4. 取消错误不弹 warning toast。
5. 已上传成功文件删除不影响其他上传任务。

### 5.8 验收标准

1. 用户点击关闭按钮后，Network 中上传请求被 abort。
2. 上传完成回调不会让已取消文件重新出现。
3. 排序后的文件列表不会删错文件。
4. 用户主动取消不会出现上传失败 toast。

## 6. PR 依赖与排期建议

| 顺序 | PR | 是否依赖前置 PR | 说明 |
|---|---|---|---|
| 1 | PR 1 短链票据 | 否 | 优先解决 AI 引用长链接问题 |
| 2 | PR 2 上传校验 | 否，但建议在 PR 1 后做 | 同样触碰 S3 上传链路，排在 PR 1 后减少冲突 |
| 3 | PR 3 ChatBox Abort | 否 | 可独立做；如 UX 紧急可以提前 |

如果只能先做一个，建议先做 PR 1。

如果要并行，建议：

1. 后端先做 PR 1。
2. 前端可并行做 PR 3。
3. PR 2 等 PR 1 合入后再做，避免 upload proxy 和 validation 同时大改。

## 7. 需要确认的决策

1. PR 1 的短链是否只替换 proxy 模式 URL，还是所有模型可见链接都强制走短代理？
2. PR 2 中无后缀纯文本且没有 `contentType` hint 时，如果允许列表同时包含 `.txt/.md/.csv`，默认按 `.txt` 接受是否可以？
3. PR 3 中取消上传后，如果 S3 对象其实已经写入，是否需要立即投递删除任务，还是接受 TTL 自动清理？
