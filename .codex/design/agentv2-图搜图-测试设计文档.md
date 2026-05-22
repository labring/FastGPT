# agentv2-图搜图-测试设计文档

## 测试目标

证明 Agent v2 内置知识库检索在补齐图搜图能力后：

- 文本检索不回归。
- 图片 id 能被解析成图片 URL 并传入 `imageQueries`。
- 底层图片 caption、图片向量召回、usage、nodeResponse 与普通 workflow 口径对齐。
- 非法图片输入不会打断 Agent 主流程。

## 测试范围

命中 Core、Logger、Package、BugFix。UI/API/DB 不命中，不设计 UI/API/DB 专项测试。

## 测试用例

| ID | 类型 | 目标文件 | 场景 | 输入 | 预期 |
|---|---|---|---|---|---|
| T-AGENT-IMG-001 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts` | 纯文本检索保持现状 | `args: {"query":"FastGPT"}` | `defaultSearchDatasetData` 收到 `textQueries:["FastGPT"]`，无 `imageQueries` 或为空；query extension/chunk selection 断言保持通过 |
| T-AGENT-IMG-002 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts` | 纯图片检索 | `args: {"query":"","imageUrls":["https://host/a.png"]}` 或实现选择后的等价内部入参 | `defaultSearchDatasetData` 收到 `textQueries:[]`、`imageQueries:["https://host/a.png"]`、`vlmModel` |
| T-AGENT-IMG-003 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts` | 图文混合检索 | `query:"找类似这张图的资料"` + 图片 URL | `textQueries` 和 `imageQueries` 分开传递，不把图片 URL 拼进文本 |
| T-AGENT-IMG-004 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts` | 图片 caption 计费 | mock `defaultSearchDatasetData` 返回 `imageCaptionResult` | `usages` 包含 `account_usage:image_parse`，`childrenResponses` 包含图片解析子节点，`childTotalPoints` 或等价汇总正确 |
| T-AGENT-IMG-005 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts` | 外部 OpenAI key 计费 | `imageCaptionResult.usedUserOpenAIKey=true` | 图片解析 usage `totalPoints=0` |
| T-AGENT-IMG-006 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/utils.test.ts` | dataset tool 获取图片映射 | `allFilesMap` 含 image，工具 args 含 image id | `dispatchAgentDatasetSearch` 收到解析后的图片 URL 或 image file map |
| T-AGENT-IMG-007 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/utils.test.ts` | 非图片 id 不进入图搜图 | `allFilesMap` 中 id 为 document | dataset search 不把 document URL 传为 image query |
| T-AGENT-IMG-008 | 单元 | `packages/service/test/core/workflow/dispatch/ai/agent/adapter/userContext.test.ts` | Agent 文件上下文保留 image | 当前轮上传 image | `allFilesMap` 包含 image，`filesMap` 不包含 image，`# Input Files` 展示 type=image |
| T-AGENT-IMG-009 | 回归 | `packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts` | 无知识库/空结果 | `datasetParams` 空或搜索结果空 | 保持 `No dataset selected` / `未找到相关信息。` 现有行为 |

## 手工验证

| ID | 路径 | 步骤 | 通过标准 |
|---|---|---|---|
| M-AGENT-IMG-001 | Agent v2 对话 | 创建/使用已选图片索引知识库的 Chat Agent v2，上传一张图片，询问“检索相似图片内容” | Agent 调用 `dataset_search`，运行详情出现知识库检索结果，能返回相关引用 |
| M-AGENT-IMG-002 | Agent v2 图文混合 | 上传图片并输入文本限定条件 | 结果受文本和图片共同影响，不只按文本检索 |
| M-AGENT-IMG-003 | 普通 workflow/简易应用回归 | 使用已有简易应用知识库图搜图入口上传图片检索 | 行为不变，`queryImages`/图片预览/计费不回归 |

## 建议执行命令

```bash
pnpm test packages/service/test/core/workflow/dispatch/ai/agent/sub/dataset.test.ts
pnpm test packages/service/test/core/workflow/dispatch/ai/agent/utils.test.ts
pnpm test packages/service/test/core/workflow/dispatch/ai/agent/adapter/userContext.test.ts
pnpm test packages/service/test/core/workflow/dispatch/dataset/search.test.ts
```

若仓库测试匹配不支持直接指定文件，则使用对应 workspace 命令：

```bash
pnpm --filter @fastgpt/service test -- core/workflow/dispatch/ai/agent/sub/dataset.test.ts
```

## Mock 约束

- `defaultSearchDatasetData` 可以 mock，用于验证 Agent 传参和 usage 汇总，不在该测试里重测底层召回。
- `MongoDataset.findById` 可以 mock，用于验证 `vectorModel vlmModel` 查询和传递。
- `createLLMResponse` 继续按现有测试 mock，用于 chunk selection。
- 不 mock `DatasetSearchToolSchema`，因为本需求核心就是工具参数协议。

## 回归重点

- Agent 文本检索仍能通过 `queryExtensionResult` 和 chunk selection。
- `read_files` 仍只能读取 document，不因为新增图片映射误把图片传给文件解析。
- `allFilesMap` 给 sandbox 的能力不变。
- 图片 caption 失败时不抛出中断，底层已有 `logger.warn('Image caption generation failed during dataset search')` 降级逻辑。

