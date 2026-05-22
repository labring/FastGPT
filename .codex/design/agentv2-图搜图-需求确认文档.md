# agentv2-图搜图-需求确认文档

## 目标

在 Agent v2 内置知识库检索工具中补齐图搜图能力，使其复用当前工作流/简易应用已经稳定的多模态知识库检索链路：

- 用户在 Agent v2 对话中上传图片并选择知识库后，Agent 可以调用 `dataset_search` 按图片内容检索知识库。
- 文本检索、图文混合检索、纯图片检索共用 `defaultSearchDatasetData` 的召回、融合、计费和运行详情能力。
- 不新增 UI，不新增 API，不新增 DB 字段，不改变训练/索引生成语义。

## 现状事实表

| 能力项 | 现有位置 | 复用/修改/新增建议 |
|---|---|---|
| Agent v2 内置知识库工具定义 | `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/utils.ts` 的 `DatasetSearchToolSchema` / `datasetSearchTool` | 修改：增加图片文件 id 参数，让模型能把 `# Input Files` 中的 image 传给工具 |
| Agent v2 知识库工具执行 | `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts` 的 `dispatchAgentDatasetSearch` | 修改：从纯 `textQueries: [query]` 扩展为文本 + 图片 query；读取 `vectorModel vlmModel`；补齐图片解析计费 |
| Agent v2 工具调度 | `packages/service/core/workflow/dispatch/ai/agent/utils.ts` 的 `ToolDispatchContext` / `getExecuteTool` | 修改：把图片文件映射传给 dataset tool，而不是只给 `read_files` 传 document map |
| Agent 文件上下文 | `packages/service/core/workflow/dispatch/ai/agent/adapter/userContext.ts` 的 `filesMap` / `allFilesMap` | 复用：`allFilesMap` 已包含 image/document；`filesMap` 仅 document，不能直接用于图搜图 |
| 普通工作流知识库图搜图入口 | `packages/service/core/workflow/dispatch/dataset/search.ts` 的 `normalizeDatasetSearchInput`、`imageQueries`、`imageCaptionResult` | 复用：Agent v2 应对齐这里的输入拆分、`vlmModel`、usage、nodeResponse 口径 |
| 默认多模态召回 | `packages/service/core/dataset/search/defaultRecall/index.ts` | 复用：这里已经完成图片 caption、图片向量召回、图文融合、阈值过滤、token 裁剪 |
| 图片向量召回 | `packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts` | 复用：支持图片 embedding 模型时走 `getVectors({ type: 'image' })` |
| 图片 caption | `packages/service/core/dataset/search/defaultRecall/imageCaption.ts` | 复用：通过 `vlmModel` 生成图片描述，并输出 `imageCaptionResult` 供计费和运行详情使用 |
| 简易应用知识库图搜图 | `projects/app/src/pageComponents/app/detail/Edit/SimpleApp/utils.ts` | 事实：简易应用把 `userChatInput` 和 `userFiles` 一起作为 `datasetSearchInput` 传给知识库节点 |
| Chat Agent v2 配置入口 | `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/utils.ts` / `packages/global/core/workflow/template/system/agent/index.ts` | 事实：Agent 节点已有 `fileUrlList`、`datasetParams`、`aiChatVision` 等配置，本需求不需要新增 UI |

## 问题定位

| 现象 | 代码证据 | 结论 |
|---|---|---|
| Agent v2 `dataset_search` 只能接文本 | `packages/service/core/workflow/dispatch/ai/agent/sub/dataset/utils.ts` 中 `DatasetSearchToolSchema` 只有 `query: z.string()` | 模型没有协议把图片 id 传给知识库工具 |
| Agent v2 dataset tool 执行时拿不到图片 URL | `packages/service/core/workflow/dispatch/ai/agent/utils.ts` 的 `ToolDispatchContext` 只有 `filesMap`，而 `userContext.ts` 注释说明 `filesMap` 只保留 document | 即使用户上传图片，dataset tool 也没有图片 URL 映射 |
| Agent v2 检索只走文本 query | `dispatchAgentDatasetSearch` 构造 `textQueries: [query]`，没有 `imageQueries` | 底层图搜图链路根本没被触发 |
| Agent v2 没有读取 `vlmModel` | `MongoDataset.findById(datasetIds[0], 'vectorModel')` | 图片 caption 召回缺少模型来源 |
| Agent v2 没有图片解析计费和运行详情 | Agent dataset tool 只处理 `queryExtensionResult`、embedding、rerank、chunk selection | 即使后续加了图片检索，不补 usage 会账单/运行详情缺口 |

## 根因分析

| 层级 | 根因 |
|---|---|
| 直接原因 | Agent v2 内置 `dataset_search` 工具协议和执行入参只按文本查询设计，没有图片 id / 图片 URL 传递通道。 |
| 深层原因 | 工作流知识库节点已经升级为 `datasetSearchInput -> textQueries/imageQueries -> defaultSearchDatasetData` 的多模态链路，但 Agent v2 内置工具是另一条调度路径，未同步这次图搜图能力。 |

## 需求范围

必须做：

- 为 Agent v2 `dataset_search` 增加可选图片输入参数，建议命名为 `imageIds?: string[]`，语义为 `# Input Files` 中 type=image 的文件 id。
- `getExecuteTool` 把 Agent 当前轮与历史可访问图片映射传给 `dispatchAgentDatasetSearch`。
- `dispatchAgentDatasetSearch` 将 `query` 和图片 URL 组合为 `textQueries` / `imageQueries`，并传入 `defaultSearchDatasetData`。
- 读取知识库 `vectorModel vlmModel`，对齐普通工作流图片 caption 召回。
- 对齐普通 workflow 的 `imageCaptionResult` usage、childrenResponses、`childTotalPoints` 与 `datasetQueries` 展示口径。
- 保留 Agent v2 现有文本检索、query extension、rerank、chunk selection、外部 OpenAI key 计费口径。
- 补充单测覆盖图搜图、图文混合、非法图片 id、空 query + 图片、外部 OpenAI key 场景。

明确不做：

- 不新增或修改前端 UI；当前文件上传、知识库选择、模型配置入口继续复用。
- 不新增 API 路由或 OpenAPI 合约。
- 不新增 DB 字段、索引或迁移。
- 不修改知识库训练、图片索引构建、图片 embedding 模型配置流程。
- 不把图片 URL 直接混入普通 query 字符串；图片必须作为结构化 `imageQueries` 进入检索。
- 不修改 `read_files` 只读 document 的语义。

## UI 判定

UI: No。

理由：Chat Agent v2 已有文件输入和知识库参数配置入口，代码锚点为 `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/utils.ts` 中 `Input_Template_File_Link`、`NodeInputKeyEnum.datasetParams`，以及 `packages/global/core/workflow/template/system/agent/index.ts` 的知识库参数输入。本需求只补 Agent v2 后端工具协议和检索调度，不引入新页面、弹窗、表单状态或 Figma 设计。

## 影响域判定矩阵

| 维度 | 是否命中 | 证据 | 需要核对的规范 |
|---|---|---|---|
| API | No | 不新增 NextJS API 路由；只改 Agent 内部工具 schema | `references/style/api.md` |
| DB | No | 不新增字段，仅读取 `MongoDataset` 已有 `vlmModel` | `references/style/db.md` |
| Front | No | 不改页面/组件，复用现有 Agent 文件和知识库配置 | `references/style/front.md` |
| UI | No | UI: No，理由见上 | `references/ui-design-development-standards.md` |
| Figma | No | 未提供 Figma，且无新 UI | Figma MCP |
| Logger | Yes | Agent dataset search 和底层图片解析已有 logger；新增非法图片 id/图片解析失败需保持结构化日志 | `references/style/logger.md` |
| Package | Yes | 改动在 `packages/service`，需遵守 `service -> global` 依赖方向 | `references/style/package.md` |
| BugFix | Yes | 现有 Agent v2 图搜图链路缺失，属于能力漏接/行为缺陷 | `references/bug-fix-workflow.md` |
| DocUpdate | No | 本次先做内部设计，不要求同步产品文档 | `references/doc-update-reminder.md` |
| DocI18n | No | 不改 `document/content/docs` | `references/doc-i18n-standards.md` |

## 验收标准

- Agent v2 `dataset_search` schema 含文本 query 和可选图片 id 参数，模型能按 `# Input Files` 中的 image id 调用。
- 纯文本检索行为与当前一致，仍支持 query extension、rerank、chunk selection。
- 纯图片检索时，即使 `query` 为空，也能通过图片 URL 进入 `imageQueries`，触发图片向量召回；若配置了可用 `vlmModel`，同时触发图片 caption 召回。
- 图文混合检索时，文本 query 和图片 query 分别进入底层召回，不拼接成单一字符串。
- `nodeResponse` 展示 `datasetQueries` 或等价字段，包含文本 query 与图片 URL；`quoteList` 为最终结果。
- 图片 caption usage 进入 `usages`，并在 `childrenResponses` 中展示图片解析子调用；使用外部 OpenAI key 时图片解析点数为 0。
- 非法/不存在/非图片 `imageIds` 不应导致整个 Agent 崩溃；应忽略无效 id 或返回可理解的工具错误，具体策略在开发文档固定。
- 所有新增/更新测试通过。

## 修复方案对比

| 方案 | 做法 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A 最小修复 | 在 Agent 内置 dataset tool 增加 `imageIds`，用 `allFilesMap` 映射图片 URL，在 `dispatchAgentDatasetSearch` 对齐普通 workflow 搜索参数和 usage | 改动最小，复用成熟检索链路，不动 UI/DB/API | 依赖模型按 schema 传 image id；需要 prompt/schema 描述清楚 | 推荐 |
| B 结构修复 | 把普通 workflow `dispatchDatasetSearch` 抽成更通用 service，Agent 和 workflow 共用同一 dispatch 封装 | 长期重复更少 | 改动面大，容易影响普通 workflow，和本次问题不成比例 | 暂不采用 |

## 回滚触发条件

- 纯文本 Agent v2 知识库检索回归，出现 query extension、rerank、chunk selection 结果或计费异常。
- 普通 workflow/简易应用知识库检索测试失败。
- Agent 工具调用 schema 导致主模型频繁无法生成合法 tool args。
- 图片检索触发异常导致 Agent 主流程中断，而不是降级为空结果。

## 待确认项

1. `imageIds` 无效时，期望“忽略无效图片继续按文本搜”，还是“返回工具错误提示模型重试”？建议默认忽略无效 id 并记录 debug/warn，避免用户体验炸锅。
2. 纯图片检索时 `query` 是否允许空字符串？建议允许，否则模型为凑 required query 会编一个废话 query，挺添乱。
3. Agent v2 nodeResponse 是否要新增 `datasetQueries` 字段并兼容旧 `query` 字段？建议保留 `query` 文本字段，同时新增 `datasetQueries`，避免前端展示老逻辑突然没饭吃。

