# agentv2-图搜图-功能开发文档

关联文档：

- `.codex/design/agentv2-图搜图-需求确认文档.md`
- `.codex/design/agentv2-图搜图-测试设计文档.md`

## 实现结论

采用最小修复方案：让 Agent v2 内置 `dataset_search` 工具显式接收图片文件 id，并在工具执行层把 id 映射为图片 URL，随后复用普通 workflow 已有的 `defaultSearchDatasetData` 多模态检索主流程。

不要把图片 URL 拼进文本 query。图片必须作为 `imageQueries` 进入底层检索，别整那种“字符串大杂烩”，后面计费、预览、融合权重全得乱套。

## 开发任务

### D-AGENT-IMG-001 扩展 dataset_search 工具协议

测试映射：T-AGENT-IMG-001、T-AGENT-IMG-002、T-AGENT-IMG-003。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/utils.ts`

改动：

- `DatasetSearchToolSchema` 从 `{ query: z.string() }` 扩展为：
  - `query: z.string().default('')` 或 `query: z.string()`
  - `imageIds: z.array(z.string()).optional()`
- `datasetSearchTool.function.parameters.properties` 增加 `imageIds`：
  - 类型：`array<string>`
  - 语义：`# Input Files` 中 `type=image` 的文件 id
  - 描述要明确“需要按图片内容检索知识库时传入”
- 是否允许 `query` 为空：
  - 推荐允许空字符串，纯图片检索不能逼模型编假 query。
  - 若使用 zod default，需要确认 `parseJsonArgs` 返回缺失 query 时的兼容行为。

完成定义：

- schema 能接受 `{ "query": "", "imageIds": ["current-0"] }`。
- 旧 `{ "query": "xxx" }` 仍通过。

### D-AGENT-IMG-002 将图片文件映射传入工具执行器

测试映射：T-AGENT-IMG-006、T-AGENT-IMG-007、T-AGENT-IMG-008。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/utils.ts`
- `packages/service/core/workflow/dispatch/ai/agent/index.ts`
- `packages/service/core/workflow/dispatch/ai/agent/piAgent/index.ts`
- 如需类型复用：`packages/service/core/workflow/dispatch/ai/agent/adapter/userContext.ts`

改动：

- `ToolDispatchContext` 增加 `allFilesMap` 或更窄的 `imageFilesMap`。
- `dispatchRunAgent` 创建 runtime 时，把 `buildAgentUserContextInput` 返回的 `allFilesMap` 传入 context。
- `dispatchPiAgent` 创建 `toolCtx` 时同样传入 `allFilesMap`，避免 `AGENT_ENGINE=pi` 分支漏掉。
- `getExecuteTool` 在 `SubAppIds.datasetSearch` 分支中解析 `DatasetSearchToolSchema` 结果对应的图片 id：
  - 只接受 `allFilesMap[id]?.type === ChatFileTypeEnum.image`
  - 去重后得到 `imageUrls`
  - 不存在或非图片 id 默认忽略，并可记录 debug/warn

完成定义：

- `read_files` 仍使用 `filesMap`，只读 document。
- `dataset_search` 能拿到 image id 对应 URL。
- sandbox 现有 `allFilesMap` 用法不受影响。

### D-AGENT-IMG-003 改造 Agent dataset search 执行参数

测试映射：T-AGENT-IMG-001、T-AGENT-IMG-002、T-AGENT-IMG-003、T-AGENT-IMG-009。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts`
- 可复用：`packages/service/core/workflow/dispatch/dataset/utils.ts`

改动：

- `DatasetSearchParams` 增加图片 URL 入参，例如 `imageUrls?: string[]`。
- tool args 中的 `query` 和执行器映射出的 `imageUrls` 组合后生成：
  - `textQueries`: 非空 query 进入文本查询。
  - `imageQueries`: 图片 URL 进入图片查询。
- 不建议直接调用 `normalizeDatasetSearchInput([...query, ...imageUrls])` 处理全部输入，原因：
  - Agent 文件 URL 可能是相对路径，`normalizeDatasetSearchInput` 当前只把 http(s) 当文件候选。
  - 执行器已经通过 `allFilesMap` 证明这些 id 是 image，没必要再靠 URL 后缀猜。
- 可以抽一个小 helper，例如 `buildAgentDatasetSearchQueries({ query, imageUrls })`，只放在 Agent dataset 子目录，别上升成公共模块。
- 空查询处理：
  - `textQueries.length === 0 && imageQueries.length === 0` 时返回空结果。
  - `query === '' && imageQueries.length > 0` 时允许继续搜索。

完成定义：

- `defaultSearchDatasetData` 收到 `textQueries` / `imageQueries`。
- 纯文本行为不变。
- 纯图片和图文混合触发底层多模态召回。

### D-AGENT-IMG-004 读取 `vlmModel` 并传到底层搜索

测试映射：T-AGENT-IMG-002、T-AGENT-IMG-004。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts`

改动：

- `MongoDataset.findById(datasetIds[0], 'vectorModel').lean()` 改为读取 `'vectorModel vlmModel'`。
- `searchData` 增加 `vlmModel: dataset?.vlmModel`。
- 保持 `getEmbeddingModel(dataset?.vectorModel)` 逻辑。

完成定义：

- 有 VLM 时，底层 `getImageCaptionQueries` 能生成 caption query。
- 无 VLM 时，底层自动降级，仅尝试图片向量召回，不抛错。

### D-AGENT-IMG-005 补齐图片 caption usage 和 nodeResponse

测试映射：T-AGENT-IMG-004、T-AGENT-IMG-005。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts`
- 复用：`packages/service/core/workflow/dispatch/dataset/nodeResponse.ts`

改动：

- import `createImageCaptionChildNodeResponse`。
- 从 `defaultSearchDatasetData` 解构 `imageCaptionResult`。
- 参考 `packages/service/core/workflow/dispatch/dataset/search.ts` 的图片解析 usage 逻辑：
  - `moduleName: i18nT('account_usage:image_parse')`
  - `usedUserOpenAIKey ? 0 : totalPoints`
  - push 到 `usages`
  - push `createImageCaptionChildNodeResponse(...)` 到 `childrenResponses`
- 计算 `childTotalPoints`，nodeResponse 中保留。
- nodeResponse 建议从 `query` 扩展为：
  - `query`: 文本 query，保留旧字段
  - `datasetQueries`: `[...textQueries, ...imageQueries]`
  - `quoteList`: 最终 `searchResults`

完成定义：

- 图片 caption 计费能在运行详情展示。
- 外部 OpenAI key 时图片 caption 点数为 0。
- 前端 WholeResponse/运行详情沿用已有 dataset node response 字段，不要求新增 UI。

### D-AGENT-IMG-006 调整 chunk selection 的 query 文本

测试映射：T-AGENT-IMG-002、T-AGENT-IMG-003。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts`

改动：

- 当前 `selectRelevantChunksByLLM({ query })` 只适合文本 query。
- 对纯图片检索，构造一个可读 query，例如：
  - 有文本：使用文本 query。
  - 无文本有图片：使用 `用户上传的图片`
  - 图文混合：使用文本 query，不把图片 URL 放进 prompt。
- 不要把图片 URL 或 base64 放入 chunk selection prompt，避免泄露长 URL/临时签名。

完成定义：

- 纯图片检索结果过长时，chunk selection 仍可运行，不因为 query 为空生成奇怪 prompt。

### D-AGENT-IMG-007 日志与错误策略

测试映射：T-AGENT-IMG-006、T-AGENT-IMG-007、M-AGENT-IMG-001。

文件：

- `packages/service/core/workflow/dispatch/ai/agent/utils.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts`

改动：

- 复用 `getLogger(LogCategories.MODULE.AI.AGENT)`。
- 非法 image id 建议 `debug` 或 `warn`，字段包含：
  - `imageId`
  - `toolId`
  - `teamId`
  - 不记录完整用户问题、不记录 token/key。
- `dispatchAgentDatasetSearch` catch 保留现有错误日志。

完成定义：

- 日志结构化，不输出密钥、完整对话、大段 URL/base64。

## 实施顺序

1. D-AGENT-IMG-001：先改工具 schema，让测试能表达新协议。
2. D-AGENT-IMG-002：打通 `allFilesMap` 到工具执行器。
3. D-AGENT-IMG-003：让 Agent dataset search 产生 `textQueries/imageQueries`。
4. D-AGENT-IMG-004：读取并传递 `vlmModel`。
5. D-AGENT-IMG-005：补 usage/nodeResponse。
6. D-AGENT-IMG-006：处理纯图片检索下的 chunk selection query。
7. D-AGENT-IMG-007：补日志与错误策略。
8. 按测试设计文档执行单测，再做 Agent v2 手工验证。

## 关键兼容策略

- 旧工具调用 `{ "query": "xxx" }` 必须继续可用。
- `imageIds` 是可选字段，不影响不上传图片的 Agent。
- `filesMap` 的 document-only 语义不变；图片走新增的 map 或 `allFilesMap`。
- 不改普通 workflow 的 `normalizeDatasetSearchInput`，避免为了 Agent 相对路径把已有工作流行为搅浑。
- 不改底层 `defaultSearchDatasetData` 的召回权重和融合逻辑，本需求只负责把 Agent 输入接入。

## MECE 核查

`发现问题 -> 影响范围 -> 修订动作 -> 修订后结果`

- Agent v2 和普通 workflow 检索入口职责重叠 -> 可能重复实现图搜图逻辑 -> 开发方案规定只在 Agent 层做输入适配，底层召回复用 `defaultSearchDatasetData` -> 检索核心唯一。
- 图片 id、图片 URL、文本 query 语义容易混淆 -> 可能把图片 URL 拼进文本导致召回/计费错乱 -> 开发方案固定 `imageIds -> imageUrls -> imageQueries`，文本只进 `textQueries` -> 字段语义独立。
- Pi Agent 分支可能漏改 -> `AGENT_ENGINE=pi` 下功能不可用 -> 开发任务 D-AGENT-IMG-002 明确同时修改 `dispatchRunAgent` 和 `dispatchPiAgent` -> 两条 Agent runtime 覆盖。
- Usage 容易只补功能不补计费 -> 账单/运行详情缺失 -> D-AGENT-IMG-005 映射 T-AGENT-IMG-004/T-AGENT-IMG-005 -> 验收覆盖。

## 自检清单

- 不新增 UI/API/DB。
- 不引入新依赖。
- 不使用 `any` 扩散新类型；若测试中沿用既有 `as any`，只限 mock 数据。
- 不把图片 URL/base64 写入日志。
- 不修改普通 workflow 图搜图主流程。
- 所有新增逻辑有测试 ID 映射。

