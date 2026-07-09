# S3 上传策略与文件类型校验重构设计

## 0. 文档标识

- 任务前缀：`s3-upload-policy-validation`
- 文档文件名：`upload-policy-validation.md`
- 更新时间：2026-07-09
- 推荐 PR：PR 2
- 优先级：P1
- 状态：已实施（PR2-T19 保留为后续项）
- 范围：上传策略、文件类型校验、上传 metadata 解析

## 1. 背景

PR1 已经把上传入口改成短上传 session：

```text
/api/system/file/u/<token>
```

现在上传已经不是浏览器直传对象存储，而是：

```text
预签 API
  -> createPresignedPutUrl()
  -> createS3UploadAccessUrl()
  -> MongoS3UploadSession
  -> app proxy PUT /api/system/file/u/<token>
  -> handleS3ProxyUpload()
  -> validateUploadFile()
  -> bucket.client.uploadObject()
```

这给 PR2 提供了一个更好的重构窗口：最终文件类型校验可以放在 app proxy 上传流里完成，不再被 S3 presigned POST/PUT 能力限制。

当前问题集中在两个位置：

1. `packages/service/common/s3/utils/uploadConstraints.ts`
   - `createUploadConstraints()` 在预签阶段读取 `filename` 后缀。
   - 当 `allowedExtensions` 存在且文件名没有后缀，直接抛 `InvalidUploadFileType`。
   - 这会导致“真实文件内容可识别，但文件名无后缀”的上传在还没上传前就失败。

2. `packages/service/common/s3/validation/upload.ts`
   - `validateUploadFile()` 上传阶段再次先检查 `filename` 后缀。
   - 当 `allowedExtensions` 存在且后缀缺失或不匹配，也直接抛 `InvalidUploadFileType`。
   - 这导致后面的 `file-type` 魔数检测、OOXML 检测、MIME 等价组逻辑没有机会参与裁决。

所以当前架构里，文件名后缀同时承担了四件事：

1. objectKey 命名。
2. 默认 `Content-Type` 推导。
3. 上传白名单校验。
4. 上传后 metadata 展示和下游 extension 读取。

这四件事应该拆开。

## 2. 第一性原理判断

上传校验里有三类信息，可信度不同：

| 信息来源 | 示例 | 可信度 | 应用方式 |
|---|---|---:|---|
| 上传策略 | 允许 `.png/.jpg`，最大大小 10MB | 高 | 服务端签发，必须遵守 |
| 文件内容事实 | PNG magic bytes，DOCX zip marker，文本 buffer | 高 | 上传阶段最终裁决核心 |
| 客户端 hint | `filename`、`file.type`、`size` | 中低 | 辅助推导，不能单独作为安全事实 |

更合理的模型是：

```text
Policy        服务端允许什么
Hint          客户端声称是什么
Evidence      文件内容证明是什么
Decision      是否允许上传，以及最终 metadata 写什么
```

其中：

1. 预签阶段只应该构建策略和保存 hint，不应该因为缺后缀拒绝。
2. 上传阶段必须读取文件内容并生成 evidence。
3. 最终是否允许上传由 `policy + evidence + hint` 共同裁决。
4. 后缀可以作为 hint，但不能作为唯一安全事实。
5. 对 PNG、PDF、DOCX 这类可内容验证类型，内容证据应该是核心裁决依据。
6. 对 `.dat/.log/.bin/.exe` 这类用户自定义或业务私有扩展名，内容通常无法证明具体后缀，只能证明“未知二进制”或“文本”。这类类型必须由 policy 明确进入 `opaque` 验证模式，允许“显式后缀 + 服务端白名单”作为通过条件。
7. 如果文件既没有可验证内容证据，也没有显式允许的 opaque 后缀，必须拒绝。

## 3. 目标

1. 无后缀文件不再在预签阶段被直接拒绝。
2. 无后缀文件上传时，如果内容可识别且策略允许，应上传成功。
3. 有后缀但内容不匹配时，对 `content/text` 验证模式仍然拒绝或按策略修正 metadata。
4. 文本类文件有明确 fallback 规则，避免“所有文本都能伪装成任意类型”。
5. 上传后 metadata 的 `originFilename/contentType` 使用最终裁决结果。
6. Dataset、Chat、Avatar、Temp、Invoke 等上传链路复用同一套策略模型。
7. 错误类型稳定，前端仍能展示正确的“类型不支持/类型不匹配/文件太大”等提示。
8. 工作流上传中用户自定义的 `.dat/.exe/.bin` 等无法由 magic bytes 稳定识别的扩展名，只要文件名显式携带该后缀且 policy 允许，应能上传成功。

## 4. 非目标

1. 不修改短链下载、short-redirect、download alias 设计。
2. 不修改 ChatBox abort 逻辑，这是 PR3。
3. 不引入杀毒、内容安全扫描、图片解码安全检查。
4. 不为了兼容无后缀文件而放开所有 `application/octet-stream`。
5. 不用 `SKIP_FILE_TYPE_CHECK` 作为正常产品路径。
6. 不在 PR2 改 objectKey 命名规则，除非 metadata 需要补展示文件名。

## 5. 当前代码问题

### 5.1 预签阶段职责过重

当前：

```ts
createUploadConstraints({ filename, uploadConstraints })
```

同时做了：

1. allowedExtensions 标准化。
2. filename 后缀检查。
3. defaultContentType 推导。

问题：

1. filename 后缀缺失时直接拒绝。
2. 预签阶段没有文件内容，不能做最终安全判断。
3. `defaultContentType` 被当成后续 expected MIME，但它可能只是 filename 推导结果。

### 5.2 上传阶段先用后缀 gate

当前：

```ts
if (allowedExtensions.length > 0 && (!extension || !allowedExtensions.includes(extension))) {
  throw new Error(S3ErrEnum.invalidUploadFileType);
}
```

这行发生在 `fileTypeFromBuffer()` 之前。

问题：

1. `.png` 内容但 filename 是 `image`，直接失败。
2. `.docx` 内容但 filename 是 `document`，无法进入 OOXML marker 检测。
3. `file.type=image/png` 这类浏览器 hint 没有参与。

### 5.3 metadata 与检测结果没有明确契约

当前 metadata 写入位置：

```ts
metadata: buildS3UploadMetadata({
  metadata,
  filename: validatedFile.filename
})
```

`validatedFile.filename` 由 `validateUploadFile()` 返回，但当前返回值只有：

```ts
{
  filename: string;
  contentType: string;
}
```

缺少：

1. 最终 extension。
2. detectionSource。
3. 是否由策略 fallback 得出。
4. 是否修正过 filename。

这会让后续排查“为什么这个无后缀文件变成 `.txt`”比较困难。

## 6. 新架构

建议新增 `uploadPolicy` 子模块，拆成三层：

```text
packages/service/common/s3/uploadPolicy/
  type.ts       Zod schema 和类型
  utils.ts      纯函数：扩展名、MIME、等价组、文本判断、OOXML hint
  service.ts    策略构建、内容 evidence、最终裁决
```

现有模块职责调整：

```text
utils/uploadConstraints.ts
  保留旧工具函数和常量导出
  createUploadConstraints 改成薄封装或逐步迁移为 createUploadPolicy

validation/upload.ts
  保留 app proxy 上传入口
  内部调用 uploadPolicy/service.ts

projects/app/src/service/common/s3/proxy.ts
  只负责流、大小、错误映射和 S3 写入
  不直接承载文件类型规则
```

## 7. 类型设计

### 7.1 UploadExtensionRule

文件：`packages/service/common/s3/uploadPolicy/type.ts`

```ts
export const UploadExtensionRuleSchema = z.object({
  extension: z.string().nonempty(),
  source: z.enum(['builtin', 'custom']),
  verification: z.enum(['content', 'text', 'opaque'])
});

export type UploadExtensionRule = z.infer<typeof UploadExtensionRuleSchema>;
```

字段说明：

| 字段 | 说明 |
|---|---|
| `extension` | 标准化后的扩展名，例如 `.png` |
| `source` | 扩展名来自系统内置类型组，还是用户自定义扩展名 |
| `verification` | 该扩展名应该如何校验 |

`verification` 规则：

| verification | 适用类型 | 通过条件 |
|---|---|---|
| `content` | `.png/.jpg/.pdf/.docx/.xlsx/.pptx` 等可识别格式 | 上传内容能证明 MIME/格式属于该扩展名或同一等价组 |
| `text` | `.txt/.md/.csv/.html/.json` 等文本类 | 内容像文本，且扩展名或 fallback 被 policy 允许 |
| `opaque` | `.dat/.log/.bin/.exe` 等自定义或私有格式 | 文件名显式携带允许的后缀；内容无法证明具体格式时不拒绝 |

注意：`opaque` 不是“关闭上传校验”，而是承认这类扩展名本身没有稳定的内容特征。它仍然必须满足服务端 policy 的显式白名单。

### 7.2 UploadPolicy

文件：`packages/service/common/s3/uploadPolicy/type.ts`

```ts
export const UploadPolicySchema = z.object({
  defaultContentType: z.string().nonempty(),
  allowedExtensions: z.array(z.string().nonempty()).optional(),
  extensionRules: z.array(UploadExtensionRuleSchema).optional(),
  allowedMimeTypes: z.array(z.string().nonempty()).optional(),
  fallbackExtension: z.string().nonempty().optional(),
  allowMissingExtension: z.boolean().optional(),
  textFallbackExtension: z.string().nonempty().optional()
});

export type UploadPolicy = z.infer<typeof UploadPolicySchema>;
```

字段说明：

| 字段 | 说明 |
|---|---|
| `defaultContentType` | 预签返回 headers 的 `content-type`，也是无法识别时的兜底 MIME |
| `allowedExtensions` | 业务允许的扩展名白名单 |
| `extensionRules` | 每个扩展名的来源与验证模式 |
| `allowedMimeTypes` | 由扩展名推导出的 MIME 白名单，作为内容检测匹配目标 |
| `fallbackExtension` | 内容检测得到 MIME 后，filename 无后缀时补的默认扩展名 |
| `allowMissingExtension` | 是否允许 filename 缺后缀进入上传阶段 |
| `textFallbackExtension` | 文本类无后缀时允许补的扩展名，例如 `.txt` |

注意：

1. `allowedMimeTypes` 不建议由调用方直接传入，优先由 service 根据 extensions 推导。
2. `fallbackExtension` 和 `textFallbackExtension` 应由服务端策略生成，不能直接信任客户端。
3. `extensionRules` 是 PR2 的关键：不能再只保存扁平的 `allowedExtensions`，否则会丢失“这是内置图片类型”还是“用户自定义 `.dat`”这类语义。

### 7.3 UploadFileHint

```ts
export const UploadFileHintSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1).optional(),
  declaredExtension: z.string().min(1).optional(),
  declaredFilename: z.string().min(1).optional(),
  source: z.enum(['local-file', 'remote-url', 'server-generated']).optional(),
  size: z.number().int().positive().optional()
});

export type UploadFileHint = z.infer<typeof UploadFileHintSchema>;
```

来源：

1. `filename`：现有入参。
2. `contentType`：浏览器 `File.type`，或后端生成文件时传入的 `contentType`。
3. `declaredExtension`：用户或上游业务显式声明“这个无后缀来源应按哪个扩展名处理”。
4. `declaredFilename`：用户或上游业务显式声明的展示文件名，例如 URL 无后缀时填 `data.dat`。
5. `source`：hint 的来源，帮助裁决时区分本地文件、远程 URL、服务端生成文件。
6. `size`：浏览器 `File.size`，用于校验和日志，不作为类型裁决核心。

注意：

1. `declaredExtension/declaredFilename` 不是安全事实，只是用户意图声明。
2. 它必须经过 policy 白名单校验。
3. 只有 `opaque/text` 这类本来无法稳定从 magic bytes 证明的类型，才应该依赖 declared hint 通过。
4. 对 `.png/.pdf/.docx` 等可内容验证类型，declared hint 不能绕过内容校验。

### 7.4 UploadFileEvidence

```ts
export const UploadFileEvidenceSchema = z.object({
  detectedMime: z.string().optional(),
  detectedExtension: z.string().optional(),
  isTextLike: z.boolean(),
  officeExtension: z.enum(['.docx', '.xlsx', '.pptx']).optional(),
  source: z.enum(['magic', 'office-zip', 'text', 'unknown'])
});

export type UploadFileEvidence = z.infer<typeof UploadFileEvidenceSchema>;
```

### 7.5 ResolvedUploadFile

```ts
export const ResolvedUploadFileSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  extension: z.string(),
  detectionSource: z.enum(['magic', 'office-zip', 'text', 'hint', 'fallback', 'opaque-extension']),
  correctedFilename: z.boolean()
});

export type ResolvedUploadFile = z.infer<typeof ResolvedUploadFileSchema>;
```

`validateUploadFile()` 后续返回这个结构。

## 8. 函数设计

### 8.1 `uploadPolicy/utils.ts`

| 函数 | 职责 |
|---|---|
| `normalizeFileExtension(extension?: string)` | 统一小写、补 `.` |
| `normalizeAllowedExtensions(extensions?: string[])` | 去重、过滤空值 |
| `parseAllowedExtensions(value: string)` | 解析逗号分隔配置 |
| `createUploadExtensionRulesFromFileSelectConfig(config)` | 从 `fileSelectConfig` 生成带 source/verification 的规则 |
| `createUploadExtensionRulesFromAllowedExtensions(extensions)` | 非 Chat 场景从扁平 extensions 生成默认规则 |
| `resolveExtensionVerification(extension, rules)` | 查询某个扩展名的验证模式 |
| `resolveMimeForExtension(extension: string)` | extension -> MIME |
| `resolveExtensionForMime(mime: string)` | MIME -> extension |
| `resolveAllowedMimeTypes(extensions: string[])` | allowedExtensions -> allowedMimeTypes |
| `mimesMatchForUpload(expected, detected)` | MIME 等价组比较 |
| `isTextLikeMime(mime: string)` | 判断文本类 MIME |
| `isLikelyTextBuffer(buffer: Buffer)` | 判断无魔数 buffer 是否像文本 |
| `detectOfficeDocumentMime({ buffer, detectedMime })` | zip 容器内识别 OOXML |
| `getOfficeZipFormatByExtension(extension)` | 判断是否需要大窗口 |

迁移原则：

1. 现有 `validation/upload.ts` 中 MIME 等价组、文本判断、OOXML marker 迁到这里。
2. `utils/uploadConstraints.ts` 中 extension 标准化工具迁到这里或从这里 re-export。
3. `getAllowedExtensionsFromFileSelectConfig()` 当前只返回扁平后缀列表，PR2 需要新增一个保留来源的新函数；旧函数可以继续给 UI accept 或兼容调用使用。
4. `canSelectCustomFileExtension` 产生的规则默认是 `verification='opaque'`。

### 8.2 `uploadPolicy/service.ts`

| 函数 | 职责 |
|---|---|
| `createUploadPolicy({ hint, uploadConstraints })` | 预签阶段构建服务端策略 |
| `createUploadPolicyFromFileSelectConfig({ hint, fileSelectConfig })` | Chat/工作流上传从文件选择配置构建带规则的策略 |
| `getUploadInspectBytes({ hint, policy })` | 根据 filename/hint/policy 决定缓冲窗口 |
| `detectUploadFileEvidence({ buffer, hint, policy })` | 从内容生成 evidence |
| `resolveUploadFile({ hint, policy, evidence })` | 最终裁决，返回 ResolvedUploadFile |
| `assertUploadFileAllowed({ hint, policy, evidence })` | 内部规则判断，抛 S3 错误 |

函数关系：

```text
createUploadPolicy()
  -> stored in upload session

handleS3ProxyUpload()
  -> getUploadInspectBytes({ hint, policy })
  -> validateUploadFile()
      -> detectUploadFileEvidence()
      -> resolveUploadFile()
```

## 9. 预签阶段设计

### 9.1 输入

当前：

```ts
createPresignedPutUrl(
  params: {
    filename: string;
    rawKey: string;
    metadata?: Record<string, string>;
  },
  options: {
    expiredHours?: number;
    maxFileSize?: number;
    uploadConstraints?: UploadConstraintsInput;
  }
)
```

建议调整：

```ts
CreatePostPresignedUrlParamsSchema = z.object({
  filename: z.string().min(1),
  rawKey: z.string().min(1),
  contentType: z.string().min(1).optional(),
  size: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.string()).optional()
});
```

### 9.2 行为

`createUploadPolicy()` 规则：

1. 标准化 `allowedExtensions`。
2. 构建 `extensionRules`：
   - 内置图片、音频、视频、PDF、Office 等类型默认 `content`。
   - 内置 `.txt/.md/.csv/.html/.json` 等文本类型默认 `text`。
   - `fileSelectConfig.customFileExtensionList` 默认 `opaque`。
   - 非 Chat 调用只传扁平 `allowedExtensions` 时，根据 MIME 可识别程度推导；无法推导 MIME 的扩展名默认 `opaque`。
3. 解析 filename extension。
4. 如果 filename 有后缀且不在 allowedExtensions：
   - 可以继续在预签阶段拒绝。
   - 原因：这是明确违反业务策略的强 hint。
5. 如果 filename 没后缀：
   - 不拒绝。
   - 设置 `allowMissingExtension=true`。
6. 如果传了 `contentType` 且能映射到 allowedExtensions：
   - `defaultContentType` 使用该 MIME。
   - `fallbackExtension` 使用匹配到的 extension。
7. 如果没有 `contentType`：
   - `defaultContentType` 使用 filename 推导，否则 `application/octet-stream`。
8. 如果 allowedExtensions 中包含文本类扩展名：
   - `textFallbackExtension` 优先取 `.txt`。
   - 如果没有 `.txt`，按固定优先级取 `.md/.csv/.json/.html`。
9. 如果 filename 是 opaque 扩展名：
   - `defaultContentType` 优先使用 `application/octet-stream`。
   - 不依赖 `contentType` hint 生成强类型判断。

### 9.3 为什么保留“有后缀不在白名单则预签拒绝”

这个和“无后缀不拒绝”不矛盾：

1. 有后缀且不在白名单，是用户明确选择了一个业务不允许的类型。
2. 无后缀只是缺少 hint，不能在没有内容事实时判断。
3. 如果有后缀但内容其实是允许类型，用户可以上传无后缀或正确后缀文件。

后续如果产品希望“有错后缀但内容对也允许”，可以再放宽，但第一版不建议。

## 10. 上传阶段设计

### 10.1 输入

上传 session payload 当前有：

```ts
{
  bucketName,
  objectKey,
  maxSize,
  uploadConstraints,
  metadata
}
```

建议 `uploadConstraints` 演进为 `uploadPolicy`：

```ts
S3UploadSessionSchema = z.object({
  ...
  uploadPolicy: UploadPolicySchema,
  fileHint: UploadFileHintSchema,
  metadata: z.record(z.string(), z.string()).optional()
});
```

兼容处理：

1. 由于 PR1 刚完成且未长期稳定，可以直接改 schema 字段。
2. 如果担心测试环境存在旧 session，可以短期让 verify 阶段兼容 `uploadConstraints`，但不建议作为长期设计。

### 10.2 缓冲窗口

当前 `getUploadInspectBytes(filename?: string)` 只看 filename 后缀。

新规则：

```text
如果 filename/hint/policy 表明可能是 docx/xlsx/pptx -> 64KB
否则 -> 8KB
```

“可能是 OOXML”的判断：

1. filename extension 是 `.docx/.xlsx/.pptx`。
2. contentType 是 OOXML MIME。
3. allowedExtensions 只允许或包含 `.docx/.xlsx/.pptx` 且 filename 无后缀。

### 10.3 内容 evidence

检测顺序：

1. `fileTypeFromBuffer(buffer)` 检测 magic bytes。
2. 如果是 zip 或 unknown，尝试 OOXML marker。
3. 如果没有 magic MIME，判断 `isLikelyTextBuffer(buffer)`。
4. 生成 `UploadFileEvidence`。

### 10.4 最终裁决规则

裁决前先解析 filename extension 对应的 `UploadExtensionRule`。

建议顺序：

1. filename 后缀不在 `allowedExtensions`，直接拒绝。
2. filename 后缀命中 `verification='opaque'`，优先进入规则 E。
3. 其余 `content/text` 类型再进入规则 A/B/C。

这个顺序很重要：`.dat/.exe` 这类 opaque 类型不能先被 MIME mismatch 规则处理，否则会把“无法内容证明的自定义格式”误判成“不匹配”。

#### 规则 A：有 magic/office evidence

1. evidence MIME 能匹配 allowedExtensions 推导出的 MIME：
   - 接受。
   - 如果 filename 无后缀，补上对应 extension。
   - 如果 filename 后缀不同但 detected 类型也在白名单：
     - 建议修正 filename extension。
2. evidence MIME 不匹配 allowedExtensions：
   - 抛 `UploadFileTypeMismatch`。

#### 规则 B：文本类 evidence

文本没有稳定 magic bytes，因此必须依赖策略 fallback。

接受条件之一：

1. filename 有文本类后缀，且该后缀在 allowedExtensions。
2. hint.contentType 是文本类 MIME，且能映射到 allowedExtensions。
3. filename 无后缀，policy.textFallbackExtension 存在。

拒绝场景：

1. allowedExtensions 只有 `.pdf/.docx/.png`，但 buffer 是文本。
2. hint.contentType 是 `text/plain`，但策略不允许任何文本扩展。

#### 规则 C：unknown binary

1. 如果没有 allowedExtensions：
   - 可以按 `application/octet-stream` 接受，保持 temp/internal 上传兼容。
2. 如果 filename 命中 opaque extension rule：
   - 交给规则 E。
3. 如果有 allowedExtensions：
   - 拒绝。
   - 原因：无法证明它属于允许类型。

#### 规则 D：`SKIP_FILE_TYPE_CHECK`

只跳过内容事实校验，不跳过基础策略：

1. filename 有不允许的后缀，仍拒绝。
2. filename 无后缀时可按 hint/default fallback 接受。

这样避免 `SKIP_FILE_TYPE_CHECK=true` 变成完全绕过上传策略。

#### 规则 E：opaque/custom extension

这是工作流自定义上传类型的关键规则。

接受条件：

1. filename 显式携带扩展名。
2. 扩展名在 `allowedExtensions` 中。
3. 该扩展名对应的 `extensionRules.verification === 'opaque'`。

通过后：

1. 不要求 `fileTypeFromBuffer()` 能识别出 `.dat/.bin/.exe` 的真实格式。
2. `detectedMime` 是 `undefined`、`application/octet-stream`、或 buffer 看起来是文本，都可以接受。
3. `resolved.filename` 保持原 filename。
4. `resolved.contentType` 默认使用 `application/octet-stream`，避免把 opaque 文件按 HTML/图片等主动预览类型返回。
5. `detectionSource='opaque-extension'`。

不接受场景：

1. filename 没有后缀，且内容也无法证明是某个内置允许类型。
2. filename 后缀不在 policy 白名单。
3. policy 没有把该扩展名标记为 `opaque`。

这意味着：

| 文件 | policy | 结果 |
|---|---|---|
| `data.dat`，未知二进制 | 自定义允许 `.dat` | 通过 |
| `data.dat`，纯文本 | 自定义允许 `.dat` | 通过 |
| `tool.exe`，magic 可识别或不可识别 | 自定义允许 `.exe` | 通过 |
| `data`，未知二进制，无后缀 | 只允许自定义 `.dat`，没有 declared hint | 拒绝 |
| `data`，未知二进制，无后缀 | 只允许自定义 `.dat`，显式声明 `.dat` | 通过 |
| `data`，PNG 内容，无后缀 | 允许内置 `.png` | 通过并补 `.png` |

原因：没有后缀的未知二进制无法证明用户想上传的是 `.dat`、`.bin` 还是别的私有格式；这时必须让用户保留后缀，或者通过显式 `declaredExtension` 声明业务意图。

### 10.5 远程 URL 无后缀的处理

这是和本地上传不同的场景。

本地上传时，浏览器至少会给出 `File.name`。如果用户选择的是 `data.dat`，即使内容是 unknown binary，系统也能拿到“用户选择了 `.dat` 文件”这个意图。

远程 URL 可能只有：

```text
https://example.com/download?id=123
```

并且：

1. URL path 没有后缀。
2. `Content-Disposition` 没有 filename。
3. `Content-Type` 是空、`application/octet-stream`，甚至被错误配置。
4. 内容 magic bytes 也无法识别。

这时服务端无法从事实层面知道它是 `.dat`、`.bin`、`.exe` 还是别的私有格式。用户“点击浏览器下载后知道它是安全 dat 文件”，对系统来说不是可观测事实，除非这个意图被显式传进来。

推荐处理：

1. **不自动把 extensionless unknown binary 推断成某个 opaque 扩展名。**
   - 否则只要允许 `.dat`，任何无后缀 unknown binary 都能绕过 allow-list。
2. **按优先级收集 filename hint。**
   - 用户/API 显式传入的 `declaredFilename/name` 优先级最高。
   - `Content-Disposition filename` 可以作为远端声明的 filename hint。
   - URL pathname basename 或受控短链里的 `filename` query 可以作为兼容 hint。
   - `Content-Type` 只能作为 MIME hint，不能替代 filename/extension 声明。
3. **给 URL 导入增加显式声明通道。**
   - UI 可以让用户填写“文件名/扩展名”，例如 `data.dat`。
   - API 可以支持对象形态，例如 `{ url, name: 'data.dat' }` 或 `{ url, declaredExtension: '.dat' }`。
   - 对现有只支持 string 的 `fileUrlList`，可以短期支持 `filename` query 作为兼容 hint，但不建议把它当成长期主设计。
4. **声明必须被 policy 约束。**
   - `declaredExtension='.dat'` 只有在当前节点/应用允许 `.dat` 时才有效。
   - 如果 `.dat` 是 custom extension，按 opaque 规则通过。
   - 如果声明 `.png/.pdf` 这类可内容验证类型，仍必须通过内容检测。
5. **opaque URL 导入默认按 `application/octet-stream` 存储和返回。**
   - 不主动设置成可浏览器执行或渲染的类型。
   - 下载时通过 `Content-Disposition: attachment` 更稳。

这个不是悖论，而是信息不足。解决方式不是让检测器猜，而是把“用户声明的业务类型”建模成独立输入，并且让它受 policy 约束。

## 11. Metadata 设计

上传成功后写入：

```ts
metadata: {
  contentDisposition,
  originFilename,
  uploadTime,
  ...
}
contentType: resolved.contentType
```

规则：

1. `originFilename` 使用 `resolved.filename`。
2. `contentType` 使用 `resolved.contentType`。
3. 如果 filename 无后缀但检测到 `.png`：
   - objectKey 可以仍无后缀。
   - `originFilename` 补成 `image.png`。
   - Dataset 下游通过 metadata 得到 extension。
4. 可选增加 metadata：
   - `detectedContentType`
   - `detectedExtension`
   - `detectionSource`

第一版建议只写现有字段，避免 metadata 变更面过大；日志里记录 detectionSource。

## 12. 错误设计

### 12.1 错误枚举

现有：

```ts
S3ErrEnum.invalidUploadFileType
S3ErrEnum.uploadFileTypeMismatch
S3ErrEnum.fileUploadDisabled
```

建议继续使用现有两个类型错误，不新增前端文案：

| 场景 | 错误 |
|---|---|
| filename 明确后缀不在 allowedExtensions | `InvalidUploadFileType` |
| 内容可识别，但不属于 allowedExtensions | `UploadFileTypeMismatch` |
| 内容不可识别，且策略要求白名单证明 | `InvalidUploadFileType` |
| 内容不可识别，但 filename 显式后缀是 policy 允许的 opaque/custom extension | 允许上传 |
| 内容不可识别，且只允许 opaque/custom extension，但 filename 无后缀 | `InvalidUploadFileType` |
| 文本 fallback 不被策略允许 | `InvalidUploadFileType` |
| 上传入口没有启用任何文件类型 | `FileUploadDisabled` |
| 超过 session maxSize | `EntityTooLarge` |

原因：

1. 前端现在会把 `InvalidUploadFileType` 和 `UploadFileTypeMismatch` 都展示为“上传文件类型不支持”。
2. 保持错误稳定，减少 i18n 和客户端兼容成本。
3. 日志里再保留更细的 reason，便于定位。

### 12.2 内部 reason

建议新增内部 reason，不暴露给前端：

```ts
type UploadRejectReason =
  | 'extension-not-allowed'
  | 'detected-mime-not-allowed'
  | 'text-fallback-not-allowed'
  | 'unknown-binary-with-allow-list'
  | 'opaque-extension-required'
  | 'office-zip-marker-mismatch';
```

日志示例：

```ts
logger.info('Rejected S3 upload file type', {
  bucketName,
  objectKey,
  filename,
  contentTypeHint,
  allowedExtensions,
  detectedMime,
  reason
});
```

### 12.3 上游捕获

当前错误出口：

1. `createPresignedPutUrl()` 会捕获 `InvalidUploadFileType/UploadFileTypeMismatch` 并继续抛给 API。
2. `handleS3ProxyRouteError()` 会把 S3 错误映射成 HTTP 400。
3. `parseS3UploadError()` 会把这两个错误转成上传类型错误文案。

PR2 需要保证：

1. 预签阶段抛出的 S3ErrEnum 仍被 API 统一处理。
2. 上传阶段抛出的 S3ErrEnum 仍返回 HTTP 400。
3. 前端 `putFileToS3()` 的 axios error 仍能被 `parseS3UploadError()` 正确识别。

## 13. API 与前端 hint 设计

### 13.1 Chat 预签 OpenAPI

文件：`packages/global/openapi/core/chat/file/api.ts`

`PresignChatFilePostUrlSchema` 增加：

```ts
contentType: z.string().optional()
declaredExtension: z.string().optional()
declaredFilename: z.string().optional()
size: z.number().int().positive().optional()
```

注意：

1. 这里是客户端 API 入参，需要使用项目 OpenAPI schema。
2. API route 继续使用 `parseApiInput`。
3. `contentType/declaredExtension/declaredFilename` 都是 hint，不能直接信任。
4. 本地文件上传优先使用 `File.name`，一般不需要传 `declaredExtension`。
5. `declaredExtension` 主要给远程 URL、服务端生成文件、或无稳定文件名的上游链路使用。

### 13.2 前端调用点

必须同步两个入口：

1. `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx`
2. `projects/app/src/components/core/app/FileSelector/index.tsx`

调用 `getUploadChatFilePresignedUrl()` 时传：

```ts
{
  filename: file.rawFile.name,
  contentType: file.rawFile.type || undefined,
  size: file.rawFile.size,
  ...
}
```

### 13.3 非 Chat 上传

Avatar、Dataset、Temp 当前 API 多数仍只传 filename。

PR2 建议：

1. 核心 service 支持 hint。
2. Chat 先接入 hint。
3. Dataset/Avatar/Temp 不强制本 PR 一次性改前端 API，但会受益于“无后缀不预签拒绝”和上传阶段内容检测。
4. 如果后续 Dataset 也要增强无后缀体验，可单独给 Dataset 预签 API 加 `contentType/size`。

### 13.4 URL 引入文件的声明设计

当前工作流存在 `fileUrlList`，运行态是 `string[]`。这对简单 URL 足够，但无法表达“这个无后缀 URL 应按 `.dat` 处理”。

建议演进为兼容形态：

```ts
const RuntimeFileUrlInputSchema = z.union([
  z.string().url(),
  z.object({
    url: z.string().url(),
    name: z.string().optional(),
    declaredExtension: z.string().optional(),
    contentType: z.string().optional()
  })
]);
```

兼容规则：

1. 旧的 `string` URL 继续支持。
2. 如果 URL 自身、`Content-Disposition`、内容 evidence 都无法证明类型：
   - 没有 declared hint：按当前严格策略拒绝或读取失败。
   - 有 declared hint：校验 declared extension 是否在当前 `fileSelectConfig` 允许范围内。
3. 对 custom extension declared hint：
   - 生成 `verification='opaque'` 的 rule。
   - unknown binary 可通过。
4. 对内置可验证类型 declared hint：
   - 仍需要内容 evidence 匹配。

这部分可以作为 PR2 的设计预留；如果本 PR 只做本地上传链路，URL 引入文件可以单独拆后续 PR，但不要在实现里把 unknown URL 静默放行。

## 14. 文件与函数组织

### 14.1 新增文件

| 文件 | 内容 |
|---|---|
| `packages/service/common/s3/uploadPolicy/type.ts` | UploadPolicy/Hint/Evidence/Resolved schema |
| `packages/service/common/s3/uploadPolicy/utils.ts` | MIME、extension、text、OOXML 纯函数 |
| `packages/service/common/s3/uploadPolicy/service.ts` | 策略构建、evidence 检测、最终裁决 |

### 14.2 修改文件

| 文件 | 修改点 |
|---|---|
| `packages/service/common/s3/contracts/type.ts` | `UploadConstraints` 迁移或扩展为 `UploadPolicy` |
| `packages/service/common/s3/utils/uploadConstraints.ts` | 保留配置解析，移除“缺后缀预签拒绝” |
| `packages/service/common/s3/validation/upload.ts` | 改为调用 uploadPolicy service |
| `packages/service/common/s3/buckets/base.ts` | 构建 uploadPolicy/fileHint 并写入 upload session |
| `packages/service/common/s3/accessLink/type.ts` | upload session schema 保存 uploadPolicy/fileHint |
| `projects/app/src/service/common/s3/proxy.ts` | guard stream 使用新 `getUploadInspectBytes({ hint, policy })` |
| `packages/global/openapi/core/chat/file/api.ts` | Chat 上传预签增加 `contentType/declaredExtension/declaredFilename/size` |
| `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts` | 解析 hint 并传给 S3 source |
| `packages/service/common/s3/sources/chat/type.ts` | Chat upload schema 增加 contentType/declaredExtension/declaredFilename/size |
| `packages/service/common/s3/sources/chat/index.ts` | 调用 createPresignedPutUrl 时传 hint |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | 上传预签传 file.type/file.size |
| `projects/app/src/components/core/app/FileSelector/index.tsx` | 上传预签传 file.type/file.size |
| `packages/global/core/workflow/type/io.ts` | 可选：为 file URL 输入预留对象形态或 declared extension |
| `packages/service/core/chat/fileStoreValue.ts` | 可选：保留外部文件对象的 name/declared extension 语义 |
| `packages/service/core/chat/fileContext.ts` | 可选：URL 读取时使用 declared hint，而不是只依赖 URL path/header |

## 15. 迁移策略

建议分两步，降低 PR 风险：

### Step 1：内部模型落地

1. 新增 `uploadPolicy` 模块。
2. `UploadConstraints` 先保留对外名称。
3. 内部增加 `fileHint` 和更强的 `UploadPolicy`。
4. 修复预签阶段无后缀拒绝。
5. 上传阶段按新裁决规则处理。

### Step 2：调用方 hint 接入

1. Chat OpenAPI 增加 `contentType/declaredExtension/declaredFilename/size`。
2. ChatBox 和 FileSelector 传 hint。
3. 补充 API 单测确认 hint 下传。

如果担心一次 PR 太大，也可以把 Step 2 留在同 PR 的后半段，但不要拆到 PR3；PR3 应只处理 abort。

## 16. 影响面

### 16.1 直接影响

1. ChatBox 文件上传。
2. 工作流/插件表单里的 FileSelector 上传。
3. Dataset 文件上传预签。
4. Avatar 上传。
5. Temp 文件上传。
6. Invoke 生成文件后上传。
7. 旧 JWT 上传 route 的兼容行为。

### 16.2 下游读取

1. Dataset 通过 `getFileMetadata().extension` 读取 extension。
2. Chat file preview 依赖 `originFilename/contentType`。
3. 图片解析 prefix 可能依赖 filename extension。

### 16.3 配置

1. `SKIP_FILE_TYPE_CHECK`
2. `fileSelectConfig`
   - `canSelectCustomFileExtension/customFileExtensionList` 不能再被压平成普通扩展名后丢失来源。
   - 这部分扩展名默认应生成 `verification='opaque'` 的规则。
3. `documentFileType`
4. `defaultFileExtensionTypes`

## 17. 测试设计

### 17.1 Unit tests

新增或重写：

```text
packages/service/test/common/s3/uploadPolicy.test.ts
packages/service/test/common/s3/uploadValidation.test.ts
packages/service/test/common/s3/uploadConstraints.test.ts
```

用例：

1. filename 无后缀，allowedExtensions 包含 `.png`，预签不拒绝。
2. filename 无后缀，contentType hint 是 `image/png`，policy 生成 fallback `.png`。
3. filename 无后缀，PNG buffer，允许 `.png`，上传成功并返回 `image.png`。
4. filename 无后缀，PNG buffer，只允许 `.jpg`，拒绝 `UploadFileTypeMismatch`。
5. filename `.jpg`，PNG buffer，allowed 包含 `.jpg/.png`，上传成功并修正为 `.png`。
6. filename `.jpg`，PNG buffer，只允许 `.jpg`，拒绝。
7. filename 无后缀，DOCX buffer，允许 `.docx`，使用 64KB window 并成功。
8. generic zip 伪装 DOCX，拒绝。
9. filename 无后缀，文本 buffer，allowed 包含 `.txt`，补 `.txt`。
10. filename 无后缀，文本 buffer，allowed 只有 `.pdf`，拒绝。
11. unknown binary，allowedExtensions 为空，按 octet-stream 兼容。
12. unknown binary，allowedExtensions 非空，拒绝。
13. `SKIP_FILE_TYPE_CHECK=true` 时仍拒绝明确不允许的 filename 后缀。
14. filename `.dat`，unknown binary，自定义允许 `.dat`，上传成功，contentType 为 `application/octet-stream`。
15. filename `.dat`，纯文本，自定义允许 `.dat`，上传成功。
16. filename 无后缀，unknown binary，只允许自定义 `.dat`，拒绝 `InvalidUploadFileType`。
17. filename `.exe`，自定义允许 `.exe`，即使 magic 识别不到，也上传成功。
18. filename `.dat`，但只允许内置 `.pdf/.png`，拒绝 `InvalidUploadFileType`。
19. source 是 remote-url，filename 无后缀，unknown binary，只允许自定义 `.dat`，没有 declaredExtension 时拒绝。
20. source 是 remote-url，filename 无后缀，unknown binary，只允许自定义 `.dat`，declaredExtension 是 `.dat` 时通过。
21. source 是 remote-url，declaredExtension 是 `.png`，但内容 unknown binary，拒绝。

### 17.2 API tests

文件：

```text
projects/app/test/pages/api/core/chat/file/presignChatFilePostUrl.test.ts
```

用例：

1. 接收 `contentType/declaredExtension/declaredFilename/size`。
2. 调用 `createUploadChatFileURL` 时透传 hint。
3. fileSelectConfig 未开启任何类型时仍返回 `FileUploadDisabled`。
4. 无后缀 filename 不在预签阶段被拒。
5. `customFileExtensionList=['.dat']` 时生成 opaque extension rule，而不是只生成扁平 `.dat`。

### 17.3 Proxy route tests

文件：

```text
projects/app/test/api/system/file/accessLink.test.ts
projects/app/test/api/system/file/sourceContentType.test.ts
```

用例：

1. 短上传 token 上传无后缀 PNG 成功。
2. 上传无后缀但策略不允许的内容返回 400。
3. 返回错误可被 `parseS3UploadError()` 解析为类型错误。
4. 旧 JWT upload route 仍可复用 shared proxy handler。
5. remote-url declared `.dat` 的 opaque policy 上传 unknown binary 成功。

### 17.4 Frontend tests

如果现有前端测试覆盖有限，PR2 至少补轻量测试或 mock 断言：

1. ChatBox 上传预签参数包含 `contentType/size`。
2. FileSelector 上传预签参数包含 `contentType/size`。
3. 远程 URL/服务端生成文件入口如果接入 declared hint，需要断言 `declaredExtension/declaredFilename` 透传。

## 18. 验收标准

1. 上传无后缀 PNG，策略允许图片，上传成功。
2. 上传无后缀 DOCX，策略允许文档，上传成功。
3. 上传无后缀纯文本，策略允许 `.txt`，上传成功并补 `.txt` metadata。
4. 上传无后缀纯文本，策略只允许 `.pdf`，上传失败。
5. 上传伪装类型文件，例如 `.png` 文件名但文本内容，上传失败。
6. 上传 `data.dat`，工作流自定义允许 `.dat`，即使内容无法被 magic bytes 识别，也上传成功。
7. 上传无后缀未知二进制，工作流只自定义允许 `.dat`，没有 declared hint 时上传失败。
8. 远程 URL 无后缀 unknown binary，显式声明 `.dat` 且 policy 允许 `.dat` 时可以通过。
9. 远程 URL 无后缀 unknown binary，显式声明 `.png` 但内容无法证明图片时失败。
10. Dataset 下游读取 metadata 后 extension 正确。
11. ChatBox 和 FileSelector 的上传预签都传了 hint。
12. 前端错误提示保持稳定。

## 19. Open Questions

1. 无后缀文本且 allowedExtensions 同时包含 `.txt/.md/.csv` 时，默认是否固定补 `.txt`？
   - 建议：第一版固定 `.txt`，除非 hint.contentType 能明确映射到 `.csv/.md`。
2. 有后缀但内容检测为另一个允许类型时，是否修正 filename？
   - 建议：修正 metadata filename，不改 objectKey。
3. 是否把 detectionSource 写进 S3 metadata？
   - 建议：第一版只打日志，不写 metadata。
4. Dataset 预签 API 是否本 PR 同步增加 `contentType/size`？
   - 建议：PR2 可以先不改 Dataset API，除非测试发现 Dataset 无后缀体验仍不可接受。
5. opaque/custom extension 遇到可识别 MIME 时，是否要拒绝明显不匹配内容？
   - 建议：第一版不拒绝。用户自定义扩展名的语义可能是业务私有容器或任意二进制，服务端无法判断“内容应不应该长成这样”。为避免浏览器主动预览风险，opaque 文件默认按 `application/octet-stream` 存储和返回。
6. URL 引入文件的对象形态是否放进 PR2？
   - 建议：PR2 文档先把模型定好。实施时如果只做本地上传链路，URL declared hint 可以拆后续 PR；但不要用“允许 custom `.dat`”作为理由静默放行所有无后缀 unknown URL。

## 20. Tasks

- [x] PR2-T1 新增 `packages/service/common/s3/uploadPolicy/type.ts`。
- [x] PR2-T2 新增 `packages/service/common/s3/uploadPolicy/utils.ts`，迁移 MIME/extension/text/OOXML 纯函数。
- [x] PR2-T3 新增 `packages/service/common/s3/uploadPolicy/service.ts`，实现策略构建、evidence 检测和最终裁决。
- [x] PR2-T4 调整 `UploadConstraintsSchema` 或新增 `UploadPolicySchema`，让 upload session 保存策略、extensionRules 和 fileHint。
- [x] PR2-T5 改造 `createUploadConstraints()`，缺后缀不再预签拒绝；有明确不允许后缀仍拒绝；自定义扩展名保留为 opaque rule。
- [x] PR2-T6 改造 `validateUploadFile()`，移除内容检测前的后缀 gate。
- [x] PR2-T7 改造 `getUploadInspectBytes()`，基于 hint/policy 判断 OOXML 大窗口。
- [x] PR2-T8 改造 `handleS3ProxyUpload()`，传入 fileHint/uploadPolicy 并写入最终 metadata。
- [x] PR2-T9 Chat 上传预签 OpenAPI schema 增加 `contentType/declaredExtension/declaredFilename/size`。
- [x] PR2-T10 Chat 预签 API 使用 `parseApiInput` 解析 hint 并传给 S3 source。
- [x] PR2-T11 `S3ChatSource.createUploadChatFileURL()` 接收并传递 contentType/declaredExtension/declaredFilename/size hint。
- [x] PR2-T12 ChatBox `useFileUpload` 预签时传 `rawFile.type/rawFile.size`。
- [x] PR2-T13 FileSelector 预签时传 `rawFile.type/rawFile.size`。
- [x] PR2-T14 补充 uploadPolicy/uploadValidation/uploadConstraints 单测。
- [x] PR2-T15 补充 Chat 预签 API 单测。
- [x] PR2-T16 补充短上传 proxy route 无后缀上传测试。
- [x] PR2-T17 补充工作流自定义 `.dat/.exe` opaque extension 上传测试。
- [x] PR2-T18 补充 remote-url 无后缀 unknown binary 的 declaredExtension 测试。
- [ ] PR2-T19 评估 `fileUrlList` 是否在 PR2 同步支持 `{ url, name, declaredExtension }`；如果不做，记录为后续 PR。
- [x] PR2-T20 回归旧 JWT upload route 和错误解析。
- [x] PR2-T21 运行 PR2 局部测试和 app typecheck。

## 21. 推荐结论

PR2 不建议继续在现有 `createUploadConstraints()` 和 `validateUploadFile()` 里局部打补丁。

更稳妥的方案是明确引入：

```text
UploadPolicy + UploadFileHint + UploadFileEvidence + ResolvedUploadFile
```

这样可以把“服务端允许什么”“客户端声称什么”“文件内容证明什么”“最终写入什么”拆开。

这个设计能解决无后缀文件被过早拒绝的问题，同时保持上传安全边界：可内容验证类型必须由内容证明；不可稳定内容验证的 custom/opaque 类型必须由“显式后缀或 declared hint + 服务端 policy 白名单”共同证明。两类证据都没有时才拒绝。
