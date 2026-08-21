# Embedding 输入超长治理功能说明

## 1. 背景

知识库入库、检索和 query extension 等链路都会调用 embedding 模型。此前部分链路只按字符长度或已有分块规则控制文本大小，但 embedding provider 实际按 token 限制输入长度，因此会出现以下问题：

- 知识库入库时，某个 index 文本超过 embedding 模型 `maxToken`，导致建索引失败。
- 知识库检索时，用户 query 或扩展 query 过长，导致 query embedding 失败。
- query extension / 文本相似度计算时，原始文本或候选文本过长，导致相似度 embedding 失败。

本次优化目标是：让知识库文本索引按 token 预算分块，并保证最终进入 embedding 的文本不超过模型 `maxToken`。原始数据内容保持不变，索引数量和粒度可能随 token 计数结果变化。

## 2. 处理原则

本次优化遵循以下原则：

- 不改变 `DatasetData.q` / `DatasetData.a` 的原文内容。
- 不改变现有用户交互和向量库结构；新增内部 rawText 预览 API，把原先浏览器内的分块计算迁到服务端。
- 不做存量数据迁移。
- 不专项优化 Markdown 表格、代码块、PDF 等内容的语义分块质量；只处理 token 上限和 header-only 等安全性问题。
- 入库阶段允许把一条 index 拆成多条 index。
- 检索 query 和相似度 query 不扩增数量；统一由 embedding 调用入口截断到安全长度。
- `getVectors` 是最后一道硬兜底：所有 text input 在请求 provider 前按模型 `maxToken` 截断；image input 不参与文本截断。

## 3. 本次改动范围

### 3.1 分块函数的长度计数能力

文件：

```text
packages/service/common/string/textSplitter.ts
packages/service/worker/text2Chunks/index.ts
packages/service/worker/function.ts
```

职责：

- `splitText2Chunks` 放在 `packages/service`，前端导入预览通过后端接口调用，不再直接依赖分块实现。
- `splitText2Chunks` 新增可选 `lengthUnit`。默认仍按字符长度执行，`token` 模式使用统一的 `o200k_base` tokenizer。
- token fallback 通过单调 code-point 游标，只在当前 chunk 附近做指数探测和二分，避免重复 tokenize 完整剩余文本。
- `maxChunks` 为预览等不可信输入提供工作量上限；空自定义分隔符、非法 overlap 和非正 chunk size 会直接报错。
- `text2Chunks` worker 承载 tokenizer 常驻内存，主 API 进程只提交可序列化的 `lengthUnit` 参数。

边界：

- 不把 tokenizer 放到 `packages/global`，避免 global 包承担后端运行时依赖。
- 前端 `fileCustom` 分块预览改为调用后端 rawText 预览接口，因此 `textSplitter.ts` 可以整体迁到 service。
- token 模式只用于知识库 index 分块这类后端场景。

### 3.2 知识库入库建索引

文件：

```text
projects/app/src/service/core/dataset/data/dataIndex.ts
```

新增核心流程：

```text
原始 q/a/index text
-> 系统 q/a index 直接调用 text2Chunks 的 token 模式
-> 按 min(indexSize, embedding maxToken - prefixTokens) 生成 index
-> 外部 index 未超限时保持原文，超限时按同一 token 模式拆分
-> 再写入向量库
```

对应 helper：

```ts
splitIndexTextByTokenLimit
buildEmbeddingSafeIndexTexts
```

影响范围：

- `getSystemIndexes`：系统默认索引直接按 token 模式和 `indexSize` 生成。
- `formatIndexes`：系统索引复用上一步的安全结果；外部文本索引只在超过 embedding 上限时拆分。
- `imageEmbedding` 类型索引不参与文本 token 拆分。

注意：

- 拆分只作用于 `indexes[].text`，不会改 `q/a` 原文。
- 拆出来的新 index 都保持原索引类型。
- 如果存在 `indexPrefix`，先拼出最终索引文本，再走 token 模式分块，保证最终送 embedding 的文本不超过模型上限。
- 如果一条超长 index 被拆成多条，新 index 会重新生成向量，不复用旧 `dataId`。

### 3.3 知识库检索阶段

文件：

```text
packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts
```

处理对象：

- `textQueries`
- `imageCaptionQueries`

处理流程：

```text
query
-> trim/filter
-> 调用 getVectors
-> getVectors 内部按 embedding maxToken 截断 text input
```

注意：

- 不把一个 query 拆成多个 query。
- 图片 URL query 不走文本 token 截断。
- 检索结果合并、rerank、RRF、limit、similarity 等逻辑不变。

### 3.4 文本相似度 / query extension 阶段

文件：

```text
packages/service/core/ai/hooks/useTextCosine.ts
```

处理对象：

- `originalText`
- `candidates[]`

处理流程：

```text
originalText / candidates
-> 过滤空文本
-> 调用 getVectors 计算向量
-> getVectors 内部按 embedding maxToken 截断 text input
-> 继续执行原 lazy greedy selection 逻辑
```

注意：

- 候选文本数量不会因为超长而扩增。
- 返回的 `selectedData` 仍是原始候选文本的 trim 结果，不因为 embedding 截断改变展示内容。
- 如果原始文本为空、无有效候选或 `k <= 0`，直接返回空结果和 `embeddingTokens = 0`。

### 3.5 embedding provider 调用

文件：

```text
packages/service/core/ai/embedding/index.ts
```

处理流程：

```text
getVectors inputs
-> 校验输入结构和空输入
-> 批量统计 text input token 数
-> 只对超限 text input 按 model.maxToken 截断
-> 按 text / image 组装 provider 请求
-> 调用 embedding provider
-> provider 返回错误时按原错误链路抛出
```

作用：

- 集中处理检索 query、相似度 query、其他直接调用 embedding 的超长文本输入。
- 避免每个调用点都重复写 token 截断逻辑。
- 入库 index 仍优先在分块阶段拆成多条索引；`getVectors` 只作为最后硬兜底。

注意：

- `getVectors` 只截断 text input，不会把单条输入拆成多条。
- Unicode 截断按 code point 二分，不会生成孤立 surrogate。
- image input 保持原有 `image_url` 结构，不走文本 token 统计。
- provider tokenizer 和本地 tokenizer 可能存在差异，如果 provider 仍返回超限错误，继续沿用原错误链路抛出。

## 4. 测试关注点

### 4.1 入库建索引测试

测试文件：

```text
projects/app/test/service/core/dataset/data/dataIndex.test.ts
```

建议验证：

- 超长 `q` 会生成多条 token-safe 默认索引。
- 超长 `a` 会生成多条 token-safe 默认索引。
- 超长自定义文本 index 会拆成多条同类型 index。
- `imageEmbedding` index 不参与文本拆分。
- 短文本不会被额外拆分。
- 带 `indexPrefix` 时，按“前缀 + 正文”的最终文本计算 token。

验收标准：

```text
每条最终写入向量库的文本 index token <= 当前 embedding model.maxToken
```

### 4.2 检索阶段测试

测试文件：

```text
packages/service/test/core/dataset/search/defaultRecall.test.ts
```

建议验证：

- 超长 `textQueries` 不会在检索阶段扩增为多条 query。
- 超长 `imageCaptionQueries` 不会在检索阶段扩增为多条 query。
- query 不会被拆成多条。
- 图片 query 不受文本截断逻辑影响。

验收标准：

```text
检索阶段把有效文本 query 原样交给 getVectors，最终截断由 getVectors 统一兜底
```

### 4.3 文本相似度测试

测试文件：

```text
packages/service/test/core/ai/hooks/useTextCosine.test.ts
```

建议验证：

- `originalText` 超长时不会在相似度阶段扩增为多条输入。
- `candidates[]` 中超长候选不会在相似度阶段扩增为多条输入。
- 返回的 `selectedData` 仍使用原候选文本。
- `k <= 0` 或无有效文本时，不调用 embedding。

验收标准：

```text
useTextCosine 只做 trim/filter 和选择逻辑，最终截断由 getVectors 统一兜底
```

### 4.4 provider 调用入口测试

测试文件：

```text
packages/service/test/core/ai/embedding/index.test.ts
```

建议验证：

- 空 inputs 或空文本 input 会被本地拒绝。
- 超长 text input 会在请求 provider 前按 `model.maxToken` 截断。
- image input 会按 image_url 结构进入 provider。
- provider 返回错误时沿用原错误链路抛出。
- 包含 emoji、生僻汉字等 astral Unicode 字符时，截断结果保持 well-formed。

验收标准：

```text
getVectors 是 embedding 超长文本的最后硬兜底；provider 错误仍能正常透出
```

### 4.5 rawText 预览 API 安全测试

测试文件：

```text
projects/app/test/pages/api/core/dataset/file/getRawTextPreviewChunks.test.ts
packages/service/test/common/string/textSplitter.test.ts
```

建议验证：

- 无知识库写权限时不执行分块。
- 自定义分隔符不允许空项、首尾 `|` 或连续 `||`。
- `overlapRatio`、`chunkSize` 必须落在安全业务范围。
- 超过 `maxChunks` 的工作量会在继续分配大数组前终止。

## 5. 手工测试建议

### 5.1 测试前准备

因为本次改动在服务端逻辑，手工测试前需要：

```text
1. 重启 app 服务。
2. 确认运行的是包含本次改动的分支。
3. 对已有数据测试时，需要重新触发更新索引或重新上传文件。
```

如果服务未重启，或仍查看旧数据索引，页面可能仍显示旧逻辑生成的索引数量。

### 5.2 入库阶段手工验证

操作：

```text
1. 创建或选择知识库。
2. 上传包含超长文本的文件。
3. 等待训练任务完成。
4. 打开数据详情，查看数据索引。
```

预期：

```text
1. 训练任务不应因为 embedding max-token 超限失败。
2. 数据可以正常完成索引生成。
3. 超长 index 可能被拆成多条默认索引。
4. 拆分结果不保证保持 Markdown 表格头、代码块边界或语义完整性。
```

### 5.3 检索阶段手工验证

操作：

```text
1. 在知识库检索测试或应用对话中输入超长 query。
2. 触发语义检索。
```

预期：

```text
1. 不应因为 query embedding 超长导致请求失败。
2. 检索会基于截断后的 query 执行。
3. 不会因为一个超长 query 扩增成多个 query。
```

## 6. 非目标说明

本次不解决以下问题：

- Markdown 表格如何按行、列、单元格拆得更适合检索。
- PDF、Excel、代码块等内容的语义化分块质量。
- 超长 query 如何摘要后再检索。
- 存量超长索引的自动迁移。
- 前端展示索引时的折叠、摘要或虚拟滚动体验。

如果后续要优化索引质量，应单独设计“知识库分块质量优化”方案，不应混在 embedding max-token 兜底里。

## 7. 风险与注意事项

- 入库阶段超长 index 拆成多条后，向量数量会增加，可能带来更多 embedding token 消耗。
- query 截断会丢弃尾部信息，极端情况下可能影响召回准确性。
- 当前 token 统计使用 FastGPT 统一 token worker，与具体 provider 的 tokenizer 可能存在轻微差异。
- rawText 预览最多生成 50,000 个 chunk，超过上限会返回分块错误，避免单请求耗尽 worker 内存。

## 8. 修改文件清单

```text
packages/service/core/ai/embedding/tokenLimit.ts
packages/service/core/ai/embedding/index.ts
packages/service/core/ai/hooks/useTextCosine.ts
packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts
packages/service/common/string/textSplitter.ts
packages/service/worker/function.ts
packages/service/worker/text2Chunks/index.ts
projects/app/src/service/core/dataset/data/dataIndex.ts
packages/global/openapi/core/dataset/file/api.ts
packages/global/openapi/core/dataset/file/index.ts
packages/global/core/dataset/training/utils.ts
projects/app/src/pages/api/core/dataset/file/getPreviewChunks.ts
projects/app/src/pages/api/core/dataset/file/getRawTextPreviewChunks.ts
projects/app/src/web/core/dataset/api/file.ts
projects/app/src/pageComponents/dataset/detail/Import/commonProgress/PreviewData.tsx
test/mocks/core/ai/embedding.ts
packages/service/test/core/ai/embedding/index.test.ts
packages/service/test/core/ai/hooks/useTextCosine.test.ts
packages/service/test/core/dataset/search/defaultRecall.test.ts
packages/service/test/common/string/textSplitter.test.ts
packages/service/test/worker/function.test.ts
projects/app/test/pages/api/core/dataset/file/getPreviewChunks.test.ts
projects/app/test/pages/api/core/dataset/file/getRawTextPreviewChunks.test.ts
projects/app/test/service/core/dataset/data/dataIndex.test.ts
```

## 9. 验收结论

本次功能验收只看一个核心结果：

```text
FastGPT 已知上游入口会尽量把 text input 控制在对应 embedding model.maxToken 内；最终是否超限以 provider 返回为准。
```

入库阶段允许拆分为多条 index；检索和相似度阶段只截断，不扩增 query 数量；`getVectors` 批量预判 token 数并只截断超限文本。
