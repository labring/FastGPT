# 普通知识库搜索开启问题优化后耗时较长分析

## 背景

用户反馈：普通知识库搜索流程中，开启“问题优化”后搜索耗时明显变长，需要分析原因。

这里的“问题优化”对应当前代码里的 `datasetSearchUsingExtensionQuery` / `query extension`，不是 Deep RAG。普通搜索入口包括：

- 搜索测试 API：`projects/app/src/pages/api/core/dataset/searchTest.ts`
- 工作流知识库搜索节点：`packages/service/core/workflow/dispatch/dataset/search.ts`
- 搜索统一入口：`packages/service/core/dataset/search/index.ts`
- 默认召回实现：`packages/service/core/dataset/search/defaultRecall/*`

## 当前调用链

### 搜索测试入口

`/api/core/dataset/searchTest` 在完成权限、余额、图片 key 校验后，构造 `searchData` 并进入普通搜索：

```ts
await defaultSearchDatasetData({
  ...searchData,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg
});
```

如果启用 Deep RAG，则走 `deepRagSearch`，不在本文“普通搜索”范围内。

### 工作流知识库搜索入口

工作流节点会先从 `userChatInput` 或 `datasetSearchInput` 归一化出 `textQueries` / `imageQueries`，再进入同一个普通搜索入口：

```ts
await defaultSearchDatasetData({
  ...searchData,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  userKey: externalProvider.openaiAccount
});
```

因此搜索测试和工作流节点的慢点基本共用，区别是工作流会携带历史记录 `histories`，问题优化 prompt 可能更长。

## 开启问题优化后的额外步骤

普通搜索未开启问题优化时，大致流程是：

1. 文本 query 直接进入 `searchDatasetData`
2. 图片 query 如有，先做图片 caption
3. embedding/full-text 多路召回
4. 可选 rerank
5. 去重、相似度过滤、token 上限过滤

开启问题优化后，在第 1 步前新增串行前置链路：

1. `datasetSearchQueryExtension`
2. `queryExtension`
3. LLM 生成候选检索词，默认 `generateCount = 10`
4. 对原问题和候选检索词再做一次 embedding
5. 用 lazy greedy 从候选里选最多 3 条
6. 原问题 + 最多 3 条扩展问题一起进入召回

也就是说，开启后不是“多一次轻量改写”，而是“LLM 改写 + embedding 筛选 + 多 query 召回放大”。

## 耗时来源拆解

### 1. LLM 改写是串行前置阻塞

`defaultSearchDatasetData` 里会先 `await datasetSearchQueryExtension(...)`，之后才调用 `searchDatasetData(...)`。因此 LLM 改写耗时会完整叠加到搜索总耗时上，不能和后续召回并行抵消。

`queryExtension` 使用 `createLLMResponse({ stream: true })` 获取完整 `answerText` 后才继续解析。即使底层是 stream，请求方仍需要等完整 JSON 数组返回才能进入下一步。

工作流场景还会把历史记录压缩后放进 prompt。历史越长，LLM 输入 token 越多，首 token 和完整输出耗时都可能增加。

### 2. 默认生成 10 个候选，随后还要 embedding 筛选

`queryExtension` 默认 `generateCount = 10`，prompt 明确要求模型输出最多对应数量的 JSON 字符串数组。拿到候选后会调用 `lazyGreedyQuerySelection`。

`lazyGreedyQuerySelection` 会对 `[原问题, ...候选问题]` 一起调用 embedding。候选 10 条时，这里是 11 条 embedding 输入。

因此问题优化固定增加至少一次 LLM 调用和一次 embedding 调用。对小知识库或原始召回很快的场景，这两个前置调用会成为主要耗时。

### 3. 扩展 query 会放大后续召回工作量

`datasetSearchQueryExtension` 会把原问题和扩展问题拼到 `queries` 里，最多可能形成 4 条文本 query：

- 原问题 1 条
- lazy greedy 选出的扩展问题最多 3 条

后续 `searchDatasetData` 使用扩展后的 `textQueries`。在 embedding 召回里，所有文本 query 会一起生成向量，然后每个向量都会调用一次 `recallFromVectorStore`。

如果搜索模式是混合检索，full-text 也会对每条 query 跑一次 Mongo text aggregate。虽然 embedding 召回和 full-text 召回之间是并行的，但每条链路内部的任务数已经被扩展 query 放大。

### 4. 混合检索和 rerank 会叠加放大

混合检索下：

- embedding 每条 query 召回最多 80 条候选
- full-text 每条 query 召回最多 60 条候选

问题优化把文本 query 从 1 条放大到最多 4 条后，候选集合更大，后续 RRF 融合、去重、相似度过滤和 token 统计都会增加工作量。

如果同时启用 rerank，`reRankQuery` 会变成原问题和扩展问题的多行拼接，rerank 文档来自文本召回结果去重后的候选集。扩展 query 越多，进入 rerank 的候选越可能变多，rerank 输入 token 和模型耗时也会增加。

### 5. 现有返回只暴露总耗时，缺少分段耗时

搜索测试 API 返回 `duration`，这是从 API handler 开始到响应前的总耗时。query extension 结果里有 `seconds`，但当前 `SearchDatasetTestResponseSchema` 只返回 `queryExtensionModel`，没有把 `queryExtensionResult.seconds`、召回耗时、rerank 耗时分别返回。

这会导致现象上只能看到“搜索慢”，但无法直接判断慢在：

- LLM query extension
- query extension embedding 筛选
- vector store 召回
- Mongo full-text
- rerank
- token filter

## 初步结论

开启问题优化后耗时变长是当前链路设计的直接结果，主要原因是：

1. LLM 改写是搜索前串行阻塞，必须完成后才能召回。
2. 默认生成 10 个候选，并额外做一次 embedding 筛选。
3. 最终最多把 4 条文本 query 送入召回，放大 embedding/full-text/rerank 的输入规模。
4. 混合检索和 rerank 同时开启时，放大效应更明显。
5. 当前 API 响应缺少分段耗时，容易把 LLM 前置耗时误判为知识库本身召回慢。

## 建议排查方式

先不要直接改召回策略，建议加临时或正式分段日志验证实际瓶颈：

1. 在 `defaultSearchDatasetData` 记录 query extension 总耗时、扩展 query 数、LLM seconds、query extension embeddingTokens。
2. 在 `searchDatasetData` 记录 image caption、multiQueryRecall、rerank、token filter 的分段耗时。
3. 在 `multiQueryRecall` 记录 text query 数、embedding task 数、full-text task 数。
4. 对比四组配置：
   - 单 query + embedding 检索 + 不开 rerank
   - 开问题优化 + embedding 检索 + 不开 rerank
   - 开问题优化 + mixed 检索 + 不开 rerank
   - 开问题优化 + mixed 检索 + 开 rerank

如果实际瓶颈集中在 query extension LLM，可以优先考虑减少候选数、换更快模型、加缓存或对短问题/无历史问题跳过扩展。

如果瓶颈集中在召回放大，可以考虑限制进入召回的扩展 query 数、按搜索模式动态调低每路 recall limit，或只让扩展 query 参与 embedding、不参与 full-text。

如果瓶颈集中在 rerank，可以考虑对 rerank 前候选数做上限裁剪，或让 rerank query 使用原问题而不是原问题 + 扩展问题的拼接文本。

## 相关代码证据

- `packages/service/core/dataset/search/index.ts`：普通搜索入口先 await query extension，再调用 `searchDatasetData`。
- `packages/service/core/dataset/search/utils.ts`：`datasetSearchQueryExtension` 把原问题和扩展问题合并后下发。
- `packages/service/core/ai/functions/queryExtension.ts`：默认生成 10 个候选，LLM 完成后再做 lazy greedy。
- `packages/service/core/ai/hooks/useTextCosine.ts`：lazy greedy 会对原问题和全部候选调用 embedding。
- `packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts`：每个 query 向量都会触发一次 vector store recall。
- `packages/service/core/dataset/search/defaultRecall/fullTextRecall.ts`：每个文本 query 都会触发一次 Mongo text aggregate。
- `packages/service/core/dataset/search/defaultRecall/rerank.ts`：rerank 对文本召回候选去重后调用 rerank 模型。

