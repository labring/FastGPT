# 已删除知识库展示需求分析

## 背景

当前分支 `deleted_show` 相对 `upstream/main` 有 2 个提交：

- `ccaf14214 feat(app): add knowledge base deleted show`
- `fc048b585 feat: workflow konwledge base hover`

本轮变更围绕应用编辑页和工作流节点中引用的知识库被删除后的展示与保存链路展开。核心目标不是让已删除知识库继续可选，而是在已有应用配置仍引用这些知识库时，详情页能够标记删除态、前端能够展示删除提示，并且保存时不把编辑态快照字段写回持久化配置。

## 变更范围

### 数据结构

- `packages/global/core/workflow/type/io.ts`
  - `SelectedDatasetSchema` 新增可选字段 `isDeleted`。
  - 该字段用于编辑态展示，不应作为最终持久化快照字段长期保存。

### 服务端详情改写

- `packages/service/core/app/utils.ts`
  - `listAppDatasetDataByTeamIdAndDatasetIds` 不再过滤 `deleteTime`，并返回 `isDeleted`。
  - `rewriteAppWorkflowToDetail` 从 `datasetSearchNode` 扩展到同时处理 `agent` 节点。
  - 支持收集并改写两类知识库配置：
    - `datasetSelectList`
    - `datasetParams.datasets`
  - 引用模式输入通过 `checkInputIsReference` 跳过，避免把 `[nodeId, key]` 当成知识库数组重写。
  - 对软删除或物理缺失的知识库补齐合法占位信息，并标记 `isDeleted: true`。

### 服务端保存格式化

- `packages/service/core/app/controller.ts`
  - `beforeUpdateAppFormat` 统一压缩知识库选择项，只保留 `{ datasetId }`。
  - 同时处理 `datasetSearchNode` 和 `agent` 节点。
  - 对 `datasetParams.datasets` 做同样压缩。
  - 对引用模式的 `datasetSelectList` 跳过格式化，保留引用值。
  - 将 Agent Skill 的 `isDeleted` 编辑态标记迁移到服务端保存前清理。

- `projects/app/src/pages/api/core/app/create.ts`
  - 创建应用时也调用 `beforeUpdateAppFormat`，避免从模板或创建入口写入完整编辑态快照。

### 前端展示

- `projects/app/src/components/core/app/DatasetCard.tsx`
  - 新增统一知识库卡片组件。
  - 根据 `dataset.isDeleted` 展示 `common:dataset_deleted`，并禁用跳转预览。
  - 支持 `form`、`workflow`、`modal` 三种展示变体。

- `DatasetSelectModal`、`SimpleApp/EditForm`、`ChatAgent/EditForm`、`NodeAgent`、`SelectDatasetRender`
  - 统一复用 `DatasetCard`。
  - 弹窗中把已删除知识库从可用选择集合里排除。
  - 弹窗确认时只回传未删除知识库；关闭弹窗不改外部配置。
  - 工作流节点选中知识库支持直接删除卡片。

### 国际化

- `packages/web/i18n/{zh-CN,zh-Hant,en}/common.json`
  - 新增 `dataset_deleted` 文案。

### 测试覆盖

- `projects/app/test/service/core/app/controller.test.ts`
  - 覆盖保存前压缩知识库快照、兼容旧单对象格式、保留引用模式、清理 Skill 删除态标记。

- `projects/app/test/service/core/app/rewriteAppWorkflowToDetail.test.ts`
  - 覆盖 Agent 引用模式、Agent `datasetParams` 改写、旧单对象格式、软删除知识库、物理缺失知识库。

- `projects/app/test/pageComponents/app/detail/WorkflowComponents/utils.test.ts`
  - 覆盖前端 store workflow 转换阶段保留引用值和编辑态快照，交由服务端统一格式化。

## 推断需求

本轮需求可以归纳为：

1. 应用或工作流中已引用的知识库被删除后，编辑详情页仍应保留该引用并明确展示“知识库已被删除”。
2. 已删除知识库不能继续作为普通可选知识库参与选择、全选、模型兼容判断。
3. 用户打开选择弹窗并确认后，应移除已删除知识库；如果只是关闭弹窗，不应隐式改写当前配置。
4. 保存应用、发布版本、创建应用时，持久化配置只保存知识库 ID，不保存头像、名称、向量模型、删除态等编辑态详情字段。
5. 工作流引用模式输入必须保持原始引用值，不能被知识库选择格式化逻辑误处理。

## 关键链路

### 详情读取链路

`app/detail`、`app/version/detail`、`app/version/latest` 获取应用或版本节点后调用 `rewriteAppWorkflowToDetail`：

1. 遍历 `datasetSearchNode` 和 `agent` 节点。
2. 收集非引用模式的 `datasetSelectList` 和 `datasetParams.datasets` 中的 `datasetId`。
3. 批量查询知识库，包含软删除记录。
4. 正常知识库使用当前数据库元信息补齐。
5. 软删除或物理缺失知识库使用占位信息并标记 `isDeleted: true`。
6. 前端根据 `isDeleted` 展示删除态。

### 保存链路

`app/update`、`app/version/publish`、`app/create` 在写入前调用 `beforeUpdateAppFormat`：

1. 非引用模式知识库选择项压缩为 `{ datasetId }[]`。
2. `datasetParams.datasets` 同样压缩。
3. Agent Skill 的 `isDeleted` 字段删除。
4. 密钥字段仍沿用原有加密逻辑。

## 当前实现的合理性

- 把编辑态快照保留到前端转换层，再由服务端保存边界统一压缩，边界更清晰。
- `rewriteAppWorkflowToDetail` 负责补齐展示详情，符合现有 app detail/version detail 的服务端改写模式。
- 引用模式用 `checkInputIsReference` 判断，比依赖 `value.length === 2` 更稳，避免把合法二元素数组误判为引用。
- 测试覆盖了软删除、物理删除、旧数据兼容、引用模式和保存格式化，和需求关键路径基本对齐。

## 风险点

1. `DatasetCard` 删除态统一显示“知识库已被删除”，不会展示原知识库快照名称。若用户需要识别具体被删的是哪个知识库，当前 UI 信息不足。
2. `formatSelectedDataset` 对软删除知识库会使用数据库中的 `deleteTime` 判断删除态，但名称优先使用旧快照 `item.name`。如果保存前已经压缩为 `{ datasetId }`，软删除详情页将没有名称，只能展示通用删除文案。
3. `DatasetSelectModal` 内部 `selectedDatasets` 只在初始化时取 `defaultSelectedDatasets`。如果父组件在弹窗打开期间更新默认值，当前实现不会同步。这与原有行为可能一致，但仍是弹窗状态边界。
4. `beforeUpdateAppFormat` 对 `NodeInputKeyEnum.skills` 的清理不限制 `flowNodeType`。如果其他节点也使用同 key 且值里有 `isDeleted`，也会被清理。当前看起来符合“保存边界清理编辑态字段”的意图，但需要确认没有别的语义。
5. `listAppDatasetDataByTeamIdAndDatasetIds` 现在会查询软删除知识库。如果后续有调用方复用该函数并期待只返回未删除数据，需要确认调用范围是否仅服务于 app detail 改写。

## 需要确认的问题

1. 删除态卡片是否只显示“知识库已被删除”，还是需要保留并展示原知识库名称，例如“知识库已被删除：xxx”？
2. 用户打开知识库选择弹窗后点击确认，会移除已删除知识库；点击关闭则保留。这个交互是否符合预期？
3. 已删除知识库是否应该允许在工作流节点卡片上直接删除？当前 `SelectDatasetRender` 支持删除，`NodeAgent` 的工作流卡片只展示不删除。
4. 物理删除且没有快照时，当前使用默认知识库头像、空名称、默认 embedding model 占位。是否接受这种占位策略？
5. 创建应用入口也压缩 `modules`，这会影响模板中预置的知识库详情快照。是否确认模板持久化也只应保留 `{ datasetId }`？

## 建议下一步

1. 先确认上述交互问题，尤其是删除态是否需要展示原名称、弹窗确认是否移除删除项。
2. 运行已有局部测试：
   - `pnpm test projects/app/test/service/core/app/controller.test.ts`
   - `pnpm test projects/app/test/service/core/app/rewriteAppWorkflowToDetail.test.ts`
   - `pnpm test projects/app/test/pageComponents/app/detail/WorkflowComponents/utils.test.ts`
3. 如果需求确认无调整，再做一次针对 `DatasetCard` 和 `DatasetSelectModal` 的前端行为检查，重点看删除态展示、hover 操作区、弹窗确认/关闭行为。
