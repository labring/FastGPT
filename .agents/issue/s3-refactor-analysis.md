# S3 重构问题分析

## 0. 文档标识

- 任务前缀：`s3-refactor`
- 文档文件名：`s3-refactor-analysis.md`
- 更新时间：2026-07-03
- 文档定位：梳理 S3 短链、上传类型校验、ChatBox 上传取消三个需求的现状、根因和影响域

## 1. 需求背景

本次需求集中在 S3 文件链路的三个相邻问题：

1. 代理上传/下载链接把 JWT 放在 URL path 中，链接很长。AI 大模型在引用这些链接时容易改写 JWT 的少量字符，导致预览或下载失败。
2. 上传策略在文件类型校验上依赖文件名后缀。用户提供的上传文件名或链接不带后缀时，即使真实文件内容可识别，也会在预签名或上传校验阶段被拒绝。
3. ChatBox 输入框里的文件上传占位可以前端移除，但底层上传请求没有被 abort。上传完成后，异步任务仍可能把已删除文件重新写回列表。

三个问题的共同本质是：当前 S3 链路把“访问授权”“对象命名”“文件类型判定”“前端上传任务状态”分别塞进了 URL、文件名、扩展名和表单数组 index 中，缺少稳定的领域对象承载这些语义。

## 2. 当前代码事实基线

| 能力项 | 现有实现位置 | 现状说明 | 结论 |
|---|---|---|---|
| 代理下载 URL 签发 | `packages/service/common/s3/security/token.ts` | `jwtSignS3DownloadToken` 把 `objectKey`、`bucketName`、`type` 放入 JWT，并生成 `/api/system/file/download/<jwt>?filename=...` | URL 长度与 payload、签名长度强绑定 |
| 代理上传 URL 签发 | `packages/service/common/s3/security/token.ts` | `jwtSignS3UploadToken` 把 `objectKey`、`bucketName`、`maxSize`、`uploadConstraints`、`metadata` 放入 JWT | 上传 token 比下载 token 更长，且包含策略细节 |
| 下载代理 | `projects/app/src/pages/api/system/file/download/[token].ts` | 只校验 JWT，再按 `bucketName/objectKey` 读取 S3；业务授权依赖签发前完成 | 可替换 token 解析来源，代理职责可复用 |
| 上传代理 | `projects/app/src/pages/api/system/file/upload/[token].ts` | 只校验 JWT，再用 token 内策略做流式大小与类型校验并上传到 S3 | 可替换 token 解析来源，校验职责可复用 |
| 预签上传入口 | `S3BaseBucket.createPresignedPutUrl` | 生成 TTL、previewUrl、代理上传 URL；调用 `createUploadConstraints` 生成上传约束 | 签发阶段已经依赖 filename 后缀 |
| 上传约束构建 | `packages/service/common/s3/utils/uploadConstraints.ts` | `createUploadConstraints` 会在 allowedExtensions 存在时要求 `filename` 必须带允许后缀 | 无后缀会在预签名阶段被拒绝 |
| 上传内容校验 | `packages/service/common/s3/validation/upload.ts` | `validateUploadFile` 先检查 filename 后缀是否在 allowedExtensions 内，再读取 buffer 用 file-type 检测 MIME | 无后缀会在内容检测前被拒绝 |
| Chat 文件预签 API | `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts` | 从 `fileSelectConfig` 派生 allowedExtensions，传给 `createUploadChatFileURL` | Chat 上传严格绑定配置扩展名 |
| Dataset 文件预签 API | `projects/app/src/pages/api/core/dataset/file/presignDatasetFilePostUrl.ts` | 使用 `datasetAllowedExtensions` 固定文档扩展名 | Dataset 上传同样绑定扩展名 |
| ChatBox 文件上传 hook | `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | `uploadFiles` 对 status=0 的文件并发预签名并 `putFileToS3`；完成后按闭包中的 index 调 `updateFiles` | 移除 UI 项不影响进行中的 Promise/axios 请求 |
| 文件预览移除按钮 | `projects/app/src/components/core/chat/ChatContainer/components/FilePreview.tsx` | close 按钮调用 `removeFiles(index)` | 只操作前端表单数组 |
| 上传工具函数 | `packages/web/common/file/utils.ts` | `putFileToS3` 用 `axios.put` 上传，当前不接收 `AbortSignal` | 需要扩展为可取消上传 |

## 3. 问题一：JWT 链接过长

### 3.1 直接原因

下载链接的 token 至少包含：

- `objectKey`
- `bucketName`
- `type`
- `iat/exp`
- JWT header 与签名

上传链接还额外包含：

- `maxSize`
- `uploadConstraints`
- `metadata`

JWT 是自包含授权，因此 URL 长度随 payload 增长。当前上传代理 URL 中真正被用户或模型看到的是完整 JWT，而不是短 ID。

### 3.2 深层原因

当前实现追求“无状态 token”，但这个场景的主要消费者包含大模型。大模型不是可靠的逐字符复制器，尤其对长 base64url/JWT 字符串容易发生字符替换、截断或重新编码。

从第一性原理看，模型可引用链接应该满足：

1. 字符数短。
2. 字符集简单。
3. 不包含高熵长片段。
4. 服务端可以根据短 ID 恢复授权上下文。
5. 过期、撤销、用途隔离仍可控。

JWT 满足无状态和防篡改，但不满足短链接与模型可复制性。

### 3.3 影响域

| 影响点 | 说明 |
|---|---|
| Chat/Workflow 输出中的文件预览 | `presignVariablesFileUrls`、chat 文件下载等最终会生成可被模型/前端引用的 URL |
| Dataset 引用图片预览 | `replaceS3KeyToPreviewUrl` 生成 proxy 下载 URL 时会把 JWT 放入 markdown |
| proxy 上传 URL | 前端上传使用，也会受 URL 长度影响，但主要是浏览器使用，不是模型引用 |
| 旧链接兼容 | 已签发 JWT 在过期前需要继续可用，不能直接删除旧路由 |

## 4. 问题二：文件类型校验依赖后缀

### 4.1 直接原因

`createUploadConstraints` 在预签名阶段执行：

```ts
if (allowedExtensions.length > 0 && (!fileExtension || !allowedExtensions.includes(fileExtension))) {
  throw new Error(S3ErrEnum.invalidUploadFileType);
}
```

`validateUploadFile` 在上传代理阶段也先执行同类判断：

```ts
if (allowedExtensions.length > 0 && (!extension || !allowedExtensions.includes(extension))) {
  throw new Error(S3ErrEnum.invalidUploadFileType);
}
```

因此无后缀文件不会进入 `fileTypeFromBuffer` 检测逻辑。

### 4.2 深层原因

当前把“文件名后缀”同时当成了：

1. 对象 key 命名依据。
2. 默认 Content-Type 推导依据。
3. allowedExtensions 白名单判断依据。
4. 上传后 metadata `originFilename` 的展示依据。
5. Dataset 解析时的 extension 来源。

这几个职责并不等价。后缀是用户提供的提示，不是安全事实。安全事实应来自真实内容检测、可信 Content-Type hint 和业务策略。

### 4.3 需要保留的约束

文件类型校验不能简单放宽为“无后缀都允许”，原因：

1. 文本类文件很难只靠魔数区分 `.txt`、`.md`、`.csv`、`.json`。
2. 有些格式是容器格式，例如 docx/xlsx/pptx 都是 zip，需要专门检测内部 marker。
3. 如果 allowedExtensions 只允许图片，不能接受任意纯文本。
4. `SKIP_FILE_TYPE_CHECK` 已有跳过入口，但不能作为正常架构方案。

因此更合理的是把上传策略拆成“预签名阶段只做明显拒绝”和“上传流阶段基于内容做最终裁决”。

## 5. 问题三：ChatBox 移除文件没有 abort 上传

### 5.1 直接原因

`FilePreview` 的关闭按钮只调用 `removeFiles(index)`，该方法来自 `react-hook-form` 的 `useFieldArray`。

`useFileUpload.uploadFiles` 已经启动的异步流程仍在继续：

1. 调 `getUploadChatFilePresignedUrl`。
2. 调 `putFileToS3`。
3. 上传完成后设置 `copyFile.url/key`。
4. 调 `updateFiles(fileIndex, copyFile)`。

因为没有取消信号、没有上传任务注册表、没有完成前检查“该文件是否已取消”，所以已移除的文件仍可能被异步任务写回。

### 5.2 额外风险

当前还有两个相邻风险：

1. `useFileUpload` 返回给 UI 的 `fileList` 是排序后的 clone，但 `removeFiles(index)` 操作的是原始 field array。只要排序改变，index 就可能对应错文件。
2. `UserInputFileItemType` 使用 `id` 字段，同时 `useFieldArray` 默认也用 `id` 作为内部 key。业务上传任务最好使用独立 `uploadId/localId`，不要复用 field array 的内部 id。

这两个问题不是用户描述的核心 bug，但如果只在现有 index/id 上补 abort，仍然容易留下竞态。

## 6. 现有测试基线

| 测试文件 | 已覆盖内容 | 后续可扩展点 |
|---|---|---|
| `packages/service/test/common/s3/token.test.ts` | upload/download JWT 类型隔离、endpoint 拼接 | 增加短票据 URL、旧 JWT 兼容 |
| `packages/service/test/common/s3/uploadConstraints.test.ts` | 扩展名标准化、预签约束构建 | 改为缺后缀不在预签阶段拒绝，并验证显式非法后缀策略 |
| `packages/service/test/common/s3/uploadValidation.test.ts` | MIME 检测、OOXML、MIME 等价组、错误类型 | 增加无后缀但 MIME 可识别、无后缀文本类、allowed MIME 集合 |
| `projects/app/test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts` | Chat 上传 allowedExtensions 传递、禁用上传 | 增加 `contentType/fileSize` 等 hint 传递 |
| `projects/app/test/api/system/file/sourceContentType.test.ts` | proxy 下载 content-type/charset | 增加短票据下载代理 |
| `projects/app/test/components/core/chat/ChatContainer/ChatBox/file.test.ts` | Chat 上传文件类型 UI helper | 增加上传任务状态纯函数测试 |

## 7. 总体结论

推荐把三个问题拆成三个可独立交付但共享语义的改造：

1. 新增 DB-backed S3 文件访问票据，用短 ID 代替 URL 中的 JWT。旧 JWT 路由保留兼容。
2. 重构上传策略为 `UploadPolicy + FileTypeResolver`：预签名不因缺后缀直接拒绝，最终由上传代理根据内容检测和策略判定。
3. 重构 ChatBox 上传任务状态：以稳定 `uploadId` 管理任务、AbortController 和 UI 项，移除时真正 abort 并阻止异步写回。

三个需求不建议合成一个超大 PR。最稳妥的执行顺序是：

1. 先做短链票据，因为它可以复用当前上传/下载代理，不必同时重写校验逻辑。
2. 再做文件类型校验，因为它会改变上传策略和测试基线。
3. 最后做 ChatBox abort，因为它主要在前端，但可顺带使用新的短上传 URL 与更清晰的上传错误语义。

## 8. 待用户确认的问题

1. 短链是否只用于 `storageDownloadMode=proxy` 的代理链接，还是所有模型可见的文件预览链接都强制走短代理，即使环境配置了外部 S3 presigned URL？
2. 无后缀纯文本文件在 allowedExtensions 包含多个文本类型时，是否允许按 `text/plain` 接受，还是必须要求前端提供可信 `contentType` hint？
3. ChatBox 用户取消上传后，如果 S3 实际已经完成写入，是否需要立即投递 S3 删除任务，还是只保证不会进入本轮 chat 文件列表并依赖 TTL 清理？
