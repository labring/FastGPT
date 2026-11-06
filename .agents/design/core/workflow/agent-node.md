# 工作流 Agent 节点技术方案

## 1. 目标与能力边界

将已有独立 Agent 的 Agent Loop 能力开放为工作流标准节点，复用同一套执行器、工具配置、技能管理和资源校验。节点按模板声明输入，表单与工作流编辑器仅适配各自的数据更新方式。

| 项目 | 行为约定 |
| --- | --- |
| 开放范围 | 注册到 `appSystemModuleTemplates`，供工作流应用使用；不加入 `pluginSystemModuleTemplates`，不扩大辅助生成白名单 |
| Agent 能力 | 保留任务规划、工具/子应用调用、技能、沙盒、知识库、对话文件、上下文压缩和 `ask_user` |
| 工具连接 | 模板 `isTool: true`，允许挂在工具调用节点下；提示词、文件链接、用户问题沿用通用输入来源切换 |
| 交互约束 | 加入 `INTERACTIVE_NODE_TYPES`，沿用交互节点的评测与并行容器限制 |
| 输出 | 正常返回拼接整个 Agent 循环全过程文本的 `answerText`（对齐 `ToolCall` 节点）；工具调用方获得 `toolResponse`；错误交给节点的 `catchError` 分支 |
| 静默模式 | 关闭 `aiChatIsResponseText` 后抑制可见 SSE 并隐藏响应展示，保留完整恢复上下文、交互、节点输出和运行详情 |

## 2. 模板是输入布局与能力来源

模板位置：`packages/global/core/workflow/template/system/agent/index.ts`。

可见输入固定按以下顺序声明（不暴露聊天记录配置项，运行时默认开启最大 50 轮历史限制）：

1. AI 模型。
2. 提示词。
3. 虚拟机。
4. 技能。
5. 工具。
6. 知识库。
7. 文件链接。
8. 用户问题。

模型参数、检索参数、标签过滤和启动脚本等附属配置采用 `hidden`，由对应弹窗编辑，不额外生成表单行。`skills`、`selectedTools` 只允许选择；`datasetSelectList` 允许选择或变量引用。沙盒显式声明 `canAgentGenerated: false`。

`NodeAgent` 通过 `settingLLMModelProps` 隐藏温度、TopP、停止词、响应格式等高级模型项，保留回复上限、多模态配置、思考配置及隐藏输出开关。

工作流 Agent 与独立 Agent 共用 `fileUrlList`（文件链接）输入，支持引用上游文件输出或手动输入 JSON，同时在工具模式下支持由外层 Agent 生成。

## 3. 工具数据模型与持久化

### 3.1 分离资源有效性与配置完整性

`SelectedToolItemType` 不保存派生的 `configStatus`。资源详情与表单输入是唯一事实来源：

- `getToolConfigStatus({ tool })` 只根据完整输入计算 `noConfig | waitingForConfig | configured`。
- `getAgentToolRuntimeStatus(tool)` 先检查 `pluginData.error`，再检查 `status ?? pluginData.status` 是否下线，最后计算配置完整性；返回 `invalid | offline | noConfig | waitingForConfig | configured`。
- 卡片、提示词资源标签、发布校验与运行时工具过滤共用上述计算，不在增删、配置弹窗、版本切换、详情回填或辅助生成时同步状态字段。
- 提示词编辑器的 `SkillLabelItemType.configStatus` 仅为展示投影。工具的 `offline` 在标签上投影为 `invalid`，不反写工具对象。

`SoonOffline` 仍可配置与调用，卡片使用当前工具的状态显示即将下线标签。

### 3.2 失败详情与原始配置分开存放

持久化工具使用 `AgentToolSchema`，其中 `inputs` 是 `{ key, mode }[]`，不等同于完整 NodeIO。

`rewriteAppWorkflowToDetail` 加载工具失败时构造：

```ts
{
  inputs: [],
  rawInputs: storedTool.inputs,
  config: storedTool.config,
  pluginData: { error: loadError }
}
```

`rawInputs` 复用 `AgentToolSchema.shape.inputs`，只用于保留无法展开的历史输入来源。保存时 `serializeAgentTool` 根据 `pluginData.error` 回写原始 `rawInputs` 与 `config`，包括未保存 `inputs` 的旧协议，避免一次打开/保存就清空配置或改变历史默认来源。

可用工具按当前完整输入投影稀疏来源配置，过滤最终由 Agent 生成的固定值，且对子应用工具（`appModule`）不持久化或透传内置 `history`（`NodeInputKeyEnum.history`）输入项（插件与普通工具声明的同名业务字段正常保留）。

画布保存先识别完整编辑详情并调用统一序列化器；已是 `AgentToolSchema` 的稀疏记录直接保留。禁止把稀疏输入强制断言为 NodeIO 再序列化。

### 3.3 独立 Agent（`ChatAgent`）作为子应用与工具引用

- `ChatAgent`（`AppTypeEnum.chatAgent`）开放到工作流画布应用选择器（`SelectAppModal`）与 Agent 工具选择器（`ToolSelectModal`），与 `simple` / `workflow` 统一映射为 `FlowNodeTypeEnum.appModule`。
- `appData2FlowNodeIO({ chatConfig, isChatAgent })` 在 `isChatAgent` 为 `true` 时不生成 `history` 输入项与输出项（`ChatAgent` 的内部 `AgentNode` 固定应用默认 50 轮历史限制）。
- 画布子应用节点（`dispatchRunAppNode`）与 Agent 子应用工具（`dispatchApp`）统一收敛至 [`runChildAppWorkflow`](../../../packages/service/core/workflow/dispatch/child/runApp.ts)，共用版本与资源快照加载（`loadChildWorkflowWithResource`）、变量与文件上下文准备（`runWithDerivedWorkflowFileContext`）、交互恢复（`lastInteractive`）与工作流执行：
  - 工具调用（`resourceType === 'tool'`）按子应用输入声明过滤 `rawVariables`，固定以空历史 `[]` 与非流式（`forbidStream = true`）执行，并在完成后合并 `system_memories`（记忆作用域为 `app:${appId}`）。
  - 画布子应用（`resourceType === 'agent'`）透传原始变量与流式配置，按 `node:${nodeId}` 隔离记忆作用域；当子应用为 `ChatAgent` 时忽略外部 `history` 配置并直接透传父级历史。

## 4. 统一资源与沙盒校验

规则位置：`projects/app/src/web/core/workflow/check/resource.ts`。

- `checkAgentResourceIssues` 检查 Agent 内嵌工具、技能与知识库。工具状态实时计算；技能和知识库使用服务端详情的资源异常标记。
- `checkAgentSandboxIssues` 检查技能对沙盒的依赖、系统沙盒开关和团队套餐能力。
- `checkWorkflowNodeResourceRules` 把上述规则接入 `checkWorkflow`，统一生成 `issueMap`。
- `checkAppForm.ts` 仅负责将表单数据适配到上述规则，并选择精确的工具错误文案，不维护第二套有效性判断。

沙盒诊断码为：

| code | 条件 | 定位 |
| --- | --- | --- |
| `sandbox_skill_unavailable` | 已选技能但未开启沙盒，或系统/套餐不可用 | `skills` |
| `sandbox_system_unavailable` | 开启沙盒但系统未配置 | `useAgentSandbox` |
| `sandbox_plan_unavailable` | 开启沙盒但套餐不支持 | `useAgentSandbox` |

当前前端检查依据为 `show_agent_sandbox` 与 `standard.enableSandbox`，不把套餐不支持误作余额不足。服务端仍负责最终运行权限和计费检查。

进入页面、10 秒巡检、节点修改重检、连线修改重检、保存/发布、单步调试及预览发送都传入同一沙盒快照并经过统一检查。快照在每次检查时从当前 store 读取，已打开的预览也能感知系统/套餐变化。删除游离的 `findWorkflowSandboxIssueNode` 前置管线；`useDebug` 直接复用工作流上下文的转换和检查入口。

### 4.1 预览检查不丢诊断详情

工具持久化会剥离 `pluginData.error`、完整输入等详情，技能持久化也不保留错误标记。仅检查序列化结果无法判断配置完整性或资源失效。

`useChatTest` 提供可选 `getResourceNodes`。工作流预览保留打开时的编辑器资源快照，独立 Agent 从当前表单补回工具与技能详情；`checkStoreWorkflowBeforeRunOrPublish` 将该快照传给 `checkWorkflow`，仅用于本地资源检查。发送和保存仍使用规范持久化结构，详情不会混入运行请求。知识库与搜索模型继续沿用原工作流有效值/模型校验管线。

## 5. 前端组件职责

| 位置 | 职责 |
| --- | --- |
| `Flow/nodes/NodeAgent/index.tsx` | 组织节点容器、输入、输出、动态工具参数和错误分支 |
| `NodeAgent/context.tsx` | 适配节点输入更新、资源身份、提示词变量与共享 Agent hooks，挂载配置和套餐弹窗 |
| `NodeAgent/AgentInputs.tsx` | 提示词、技能和工具的薄渲染器，消费当前节点上下文 |
| `RenderInput/index.tsx` | 统一标签、输入顺序、来源选择、引用、Agent 生成占位、沙盒和资源选择模板分发 |
| `components/WorkflowSandboxConfig.tsx` | Agent 与 ToolCall 共用的沙盒配置控件，启动脚本是隐藏附属输入 |
| `Edit/ChatAgent/hooks/useAgentSkillSelect.ts` | 通过技能列表、沙盒状态及更新回调管理技能/沙盒约束，不依赖具体表单状态容器 |
| `Edit/ChatAgent/hooks/useSkillManager.tsx` | 表单与工作流共用提示词 `@` 选项、资源状态、工具配置弹窗 |
| `SelectedToolCardList` / `AgentSkillCardList` | 表单与工作流共用资源卡片、异常标签与删除行为 |

仅提示词编辑器通过 `CustomComponent` 注入 Agent 专属能力；技能和工具使用标准 `selectSkill` / `selectTool` 渲染项。引用与 Agent 生成模式的优先级在通用 `RenderInput` 处理，节点不再手写同一套标签、引用器与占位块。

技能选择前与添加时检查系统及套餐能力；添加技能与开启沙盒一起更新，列表通过函数更新消费最新状态，避免异步选择覆盖期间完成的编辑。系统/套餐允许时，已有技能维持沙盒开启；关闭前要求先移除依赖技能。系统或套餐不可用时保留历史配置与修复入口，按统一检查阻止继续运行/发布。套餐升级提示与充值弹窗由共享 Hook 提供，后台巡检只更新问题状态。

### 5.1 知识库参数与过滤条件

`SelectDataset` 在知识库标题右侧提供内联参数入口，复用权限开关、引用选择和 `DatasetParamsModal`。标签过滤使用共享弹窗在检索配置中提供的开关及「手动配置 / 整项变量引用」切换，不再维护 Agent 专属弹窗。模型选择继续传入当前 `appId`。已有独立参数行的知识库搜索节点继续使用原入口。

`getDatasetSearchParams` 从节点顶层输入读取配置，不用 truthy 判断覆盖 `false` 或 `0`。参数编辑、权限开关和标签过滤清理通过同一转换器批量回写当前顶层输入，避免维护重复分支。移除知识库后通过共享 `useDatasetTagFilterPrune` 清理不再可用的标签条件，移除全部知识库时也执行清理。

`collectionFilterMatch` 保留隐藏手动输入与标准 `reference` 两种来源，整项变量引用按 `[nodeId, outputKey]` 保存，接入通用引用检查和运行时解析；两种模式都只在参数弹窗编辑，画布不生成重复输入行。Core 校验仍按 key 将结构化手动条件转换为运行时字符串。旧 `datasetParams.collectionFilterMatch` 的整项引用由同一过滤参数归一化器解析，保持与顶层输入一致。

知识库使用变量引用时无法在编辑期确定静态知识库 ID，`useDatasetTagFilterPrune` 跳过按静态 ID 的裁剪以保留已有过滤条件，同时支持切换为整项变量引用生成完整过滤 JSON；只有在静态知识库模式下移除全部知识库（`datasetIds` 为空数组）时，才清理已失效的自定义标签条件。固定知识库继续使用标签交集配置条件，系统属性条件不依赖自定义标签元数据。

## 6. 执行与恢复约定

### 6.1 文件、作用域与交互恢复

- 独立 Agent 与工作流 Agent 均通过 `fileUrlList` 输入控制当前文件传入与历史文件解析，具体媒体能力仍由所选模型限制。
- 继续使用 `WorkflowMemoryState` 的节点/子应用作用域，不新增并列 memory 系统。
- `Agent` 作为子工具或子应用运行时，父级会将子 `Agent` 的展示输出标为 `displayOnly: true`（或子应用传入空 `histories`）以隔离父模型上下文：
  - **`FastAgent` 暂停与恢复**：进入 `interactive` 暂停时，按 `getWorkflowNodeMemoryKey` 作用域键保存当前节点的完整 `transcript`（`[...requestMessages, { dataId: responseChatItemId, obj: AI, value: outputAssistantResponses }]`）；交互恢复（`lastInteractive`）时通过 `memoryState.readNodeMemory` 优先恢复自身 `transcript` 与 `activePlan`，并从本次运行首个携带 `inputContext` 的 AI 消息起提取暂停前已累积的 `previousAssistantResponses`。
  - **`PiAgent` 暂停与恢复**：通过 `buildAgentLoopCorePausedMemories` / `readAgentLoopCoreProviderStateMemory` 在节点作用域键中一并保存与恢复 `{ providerState, assistantResponses }`。
  - **跨交互恢复轮次的输出汇总与历史清理**：恢复完成时，`buildAgentLoopCoreFinalAssistantOutput` 将 `previousAssistantResponses` 与当前恢复轮增量合并计算完整节点输出 `answerText`（同时保持落库的 `assistantResponses` 仅含当前恢复轮增量，避免聊天气泡重复）；并通过 `removeUnfinishedInteractiveHistories` 返回 `rewriteHistories` 清理未完成交互链（`dispatchRunAgent`、`dispatchRunTools`、`dispatchRunAppNode`、`dispatchLoopRun` 统一对齐），且在节点完成或异常结束时将节点作用域 memory 置为 `undefined` 清理。
  - **`appendWorkflowInteractiveValue` 防循环引用**：更新已有交互项时使用浅拷贝替换（`values[existingIndex] = { ...values[existingIndex], interactive }`），避免子工作流同时输出 `history` 到 `nodeOutputs` 时产生共享对象循环引用。

### 6.2 静默输出

`aiChatIsResponseText === false` 时：

1. workflow adapter 关闭正文、思考、工具 SSE；共享 event stream 同时拦截 plan 与 planStatus。
2. 与 `AI 对话` / `工具调用` 节点保持一致，不向工作流顶层返回 `assistantResponses`（返回 `undefined`），避免多节点串联时静默节点的 `inputContext` 和内部输出污染后续节点的对话历史。
3. 暂停恢复所需的 `inputContext`、模型原始工具调用、计划、暂停前累积输出与交互记录由节点作用域 `memoryState`（`getWorkflowNodeMemoryKey`）独立保存并在恢复时读取。
4. `interactive` 继续返回，追问由底部输入区处理；非流式响应与前端气泡均兼容保留 `hideInUI` 项上的 `interactive` 展示；`answerText`、`toolResponse`、usage 与 nodeResponse sink 正常工作。

### 6.3 错误捕获与工具返回

- **工具错误**：Agent 内部工具错误交由 Agent Loop 消化。
- **节点级错误与 `catchError`**：
  - 当开启 `catchError` 时，[`createAgentLoopCoreNodeResponseEventCollector`](../../../packages/service/core/workflow/dispatch/ai/agentLoopCore/adapter/nodeResponse/eventCollector.ts) 在 `llm_request_end` 报错详情上标记 `errorCaptured: true`，避免外层 `runWorkflow` 将内部主模型报错重复计入未捕获的 `workflowRuntimeSummary.errorText` 并弹出顶层报错横幅；同时 [`dispatchRunAgent`](../../../packages/service/core/workflow/dispatch/ai/agent/index.ts) 不再将 `errorText` 拼入聊天气泡正文，仅通过 `error: { errorText }` 与 `rawError` 驱动工作流异常分支。
  - 未开启 `catchError` 时，保留既有可见错误展示与阻断行为。
- **全过程文本聚合 (`answerText` / `toolResponse`)**：
  - 成功完成时，`answerText` 与纯文本 `toolResponse` 与 `ToolCall` 节点保持一致，汇总当次 Agent 执行循环全过程（含工具调用前后、子工具调用及跨交互恢复轮次）产生的所有模型文本输出；`buildAgentLoopCoreFinalAssistantOutput` 按全量已持久化文本（含 `displayOnly` 子工具输出）判重，仅补齐未流式落库的尾部增量，避免重复追加。
  - 节点级失败返回 `{ error }`，供外层工具调用消费；交互暂停继续返回交互状态与恢复数据，不伪造完成返回值。

### 6.4 运行详情层级（工作流模式 vs 简易模式）

- **简易模式（对话 Agent / Skill 调试）**：不生成外层 `Agent` 容器 `nodeResponse`，内部的 `Agent 对话`、工具调用、任务规划、追问、上下文压缩等步骤继续在当前作用域顶层平铺展示。
- **工作流模式（画布 `Agent` 节点）**：`dispatchRunAgent` 返回外层 `Agent` 节点的 `nodeResponse`（含 `model`、`query`、`textOutput`、`childResponseCount`、`childrenResponses`、`errorText`），并通过 `createAgentNodeResponseCollector` 为未携带 `parentId` 的内部步骤统一绑定 `parentId = nodeResponseParentId`，使运行详情树将该 `Agent` 节点下的全部执行步骤收纳到该节点下展示（已携带更深层 `parentId` 的子项如 `toolResponseCompress` 保持原有父子关系）。

### 6.5 嵌套沙盒会话归属与启用态传播

- **根会话归属**：根 `dispatchWorkFlow` 在 `WorkflowContext.sandboxContext` 中保存只读的 `(sourceType, sourceId, teamId, userId, chatId)`。子应用、插件、循环与并行分支继承该上下文；Agent/ToolCall 的沙盒与套餐检查使用根身份，应用资源鉴权仍使用自身的 `runningAppInfo`。独立运行节点时使用当前身份兜底，`WorkflowMemoryState` 不参与沙盒管理。
- **共享 Skill 缓存**：已发布 Skill 按 `versionId` 追加部署，初始化不删除其他正式版本目录。每次执行仍重新校验所选资源，仅扫描当前节点选中的版本；缓存保留到显式清理或沙盒存储删除，归档恢复继续复用。重建版本目录后清除其旧 Skill entrypoint 标记。
- **启动脚本去重**：Agent 与 ToolCall 使用 `sandboxEntrypoint:<sourceType>:<sourceId>:node:<nodeId>` 分别记录成功 hash，父子脚本互不覆盖。Skill entrypoint 的成功 `versionId` 集合随缓存追加保留；脚本或状态读写失败仍沿用非阻断约定。
- **启用态汇总与持久化**：`hasAgentSandbox` 表示会话曾成功准备 Sandbox runtime。Agent/ToolCall 共用的 `ensureWorkflowSandboxReadyForUse` 在 runtime 准备成功后，先按根身份及 teamId 幂等更新已有 `Chat.summary.hasAgentSandbox = true`，再发送 `ready` 事件。节点成功后才标记内存摘要，并经由子应用、插件、循环和并行边界向上汇总；`saveChat` / `updateInteractiveChat` 继续单向补写，不清除此前标记。会话鉴权优先使用累计 summary，再读取测试 metadata 或应用节点配置，仍检查系统和团队权限；测试 metadata 只表达本轮根节点开关，不混入子流程摘要。

## 7. 导出过滤

开启敏感信息过滤后清空 Agent 的技能、工具、手动选择的知识库（保留 `nodeInputIsReference` 变量引用元组）与旧 `datasetParams.datasets`，剥离提示词中的 `{{@...@}}` 资源引用标签，并更新相应多语言说明。资源详情不成为新的持久化协议。

## 8. 自动化单元与集成测试矩阵

### 8.1 自动化测试套件

| 测试层级与模块 | 测试文件 | 核心覆盖场景 |
| --- | --- | --- |
| **Agent 节点调度与跨轮次恢复集成测试** | [`packages/service/test/core/workflow/dispatch/ai/agent/index.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agent/index.test.ts) | 1. 默认 50 轮历史上下文、文件过滤、提示词 `{{@toolId@}}` 引用解析与沙盒可用性校验；<br/>2. 多步工具调用全过程文本聚合（`answerText` / `toolResponse`）与流式增量去重；<br/>3. 简易模式平铺 vs 工作流模式外层 `Agent` 根 `nodeResponse` 包装与子步骤收纳；<br/>4. `FastAgent` / `PiAgent` 在 `ask_user` 单次与多次暂停/恢复下的节点级 `memoryState` 隔离、暂停前输出保留（`previousAssistantResponses`）、恢复后 `rewriteHistories` 清理及完成态 memory 清空；<br/>5. `ToolCall -> Agent` 子工具作用域下 `ask_user` 暂停与跨轮恢复（父历史 `displayOnly` 隔离）；<br/>6. 静默模式（`isResponseAnswerText = false`）抑制可见 SSE 与 `assistantResponses`、保留恢复上下文；<br/>7. 开启/关闭 `catchError` 时的 `errorText`、`rawError`、气泡文本抑制与异常分支路由；<br/>8. 嵌套子应用下复用根会话 `(sourceType, sourceId)` 初始化沙盒并上报 `hasAgentSandbox` |
| **子应用统一执行与嵌套沙盒传播** | [`packages/service/test/core/workflow/dispatch/child/runApp.test.ts`](../../../packages/service/test/core/workflow/dispatch/child/runApp.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/ai/agent/sub/app.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agent/sub/app.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/dataTransfer.child.test.ts`](../../../packages/service/test/core/workflow/dispatch/dataTransfer.child.test.ts)<br/>[`packages/service/test/core/chat/saveChat.test.ts`](../../../packages/service/test/core/chat/saveChat.test.ts)<br/>[`projects/app/test/service/core/sandbox/access.test.ts`](../../../projects/app/test/service/core/sandbox/access.test.ts) | 1. `runChildAppWorkflow` 统一驱动画布子应用与 Agent 子应用工具，区分 `agent` / `tool` 资源快照、流式开关与记忆作用域；<br/>2. `ChatAgent` 作为子应用时忽略外部 `history` 配置并透传父级历史；作为工具时过滤 `history` 参数并使用空历史；<br/>3. `hasAgentSandbox` 经由子应用、插件、`loopRun`、`parallelRun`、`runLoop` 向上汇总；<br/>4. `saveChat` / `updateInteractiveChat` 单向持久化服务端 `summary.hasAgentSandbox` 且忽略客户端伪造 `metadata.appSandboxEnabled`；<br/>5. `resolveSandboxSessionAvailability` 基于 `chat.summary.hasAgentSandbox` 放行嵌套沙盒会话 |
| **AgentLoopCore 输出聚合与去重** | [`packages/service/test/core/workflow/dispatch/ai/agentLoopCore/output/assistantResponses.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agentLoopCore/output/assistantResponses.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/ai/agentLoopCore/output/result.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agentLoopCore/output/result.test.ts) | 1. `compactAgentLoopCorePlanSnapshots` 多计划快照收敛与完成态 `null` 终止标记；<br/>2. `buildAgentLoopCoreFinalAssistantOutput` 含 `displayOnly` 子工具响应时的判重与缺失后缀补齐；<br/>3. `previousAssistantResponses` 跨交互恢复轮次拼接 `answerText` 且不污染当前轮 `assistantResponses`；<br/>4. 多轮工具调用与错误态下 `summarizeAgentLoopCoreResult` 全过程 `finalText` 与 `reasoningText` 汇总 |
| **节点级记忆与暂停态存储** | [`packages/service/test/core/workflow/dispatch/ai/agentLoopCore/memory/providerState.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agentLoopCore/memory/providerState.test.ts)<br/>[`packages/service/test/core/workflow/memory/state.test.ts`](../../../packages/service/test/core/workflow/memory/state.test.ts) | 1. 根级与 `fork` 作用域键下 `providerState` 及 `assistantResponses` 的写入、恢复与完成态清空；<br/>2. 旧版 `agentLoopMemory-${nodeId}` 键兼容读取与未包装旧数据过滤；<br/>3. `WorkflowMemoryState` 在并行/嵌套子流程下的深拷贝隔离与 delta 合并 |
| **运行详情收集与错误捕获标记** | [`packages/service/test/core/workflow/dispatch/ai/agent/nodeResponseCollector.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agent/nodeResponseCollector.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/ai/agentLoopCore/nodeResponse/eventCollector.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agentLoopCore/nodeResponse/eventCollector.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/ai/agentLoopCore/eventStream/createEventStream.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agentLoopCore/eventStream/createEventStream.test.ts) | 1. 工作流模式下为内部步骤自动补齐 `parentId = nodeResponseParentId`，同时保留 `toolResponseCompress` 等深层 `parentId`；<br/>2. `node.catchError = true` 时 `llm_request_end` 错误响应自动标记 `errorCaptured: true`；<br/>3. `streamAnswer = false` 时统一拦截 `plan` 与 `planStatus` SSE 事件 |
| **运行时工具加载与工作流交互历史清理** | [`packages/service/test/core/workflow/dispatch/ai/agent/sub/tool/utils.test.ts`](../../../packages/service/test/core/workflow/dispatch/ai/agent/sub/tool/utils.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/utils.test.ts`](../../../packages/service/test/core/workflow/dispatch/utils.test.ts)<br/>[`packages/service/test/core/workflow/dispatch/index.test.ts`](../../../packages/service/test/core/workflow/dispatch/index.test.ts) | 1. 应用/插件/MCP/HTTP 工具在输入归一化与 mode 应用后再执行 `validateToolConfiguration` 与 `getToolConfigStatus` 过滤；<br/>2. `removeUnfinishedInteractiveHistories` 清理单轮与连续多轮交互链，保障 `Agent#1 -> Agent#2` 串联与 `LoopRun` 跨迭代恢复不误消费历史交互；<br/>3. `appendWorkflowInteractiveValue` 浅拷贝更新避免 `nodeOutputs.history` 循环引用；<br/>4. `collectionFilterMatch` 顶层与 `datasetParams` 整项变量引用运行时解析 |
| **工具状态模型、资源回填与画布转换** | [`packages/global/test/core/app/formEdit/utils.test.ts`](../../../packages/global/test/core/app/formEdit/utils.test.ts)<br/>[`projects/app/test/service/core/app/rewriteAppWorkflowToDetail.test.ts`](../../../packages/app/test/service/core/app/rewriteAppWorkflowToDetail.test.ts)<br/>[`projects/app/test/pageComponents/app/detail/WorkflowComponents/utils.test.ts`](../../../projects/app/test/pageComponents/app/detail/WorkflowComponents/utils.test.ts) | 1. `getToolConfigStatus` 与 `getAgentToolRuntimeStatus` 派生计算（`invalid` / `offline` / `waitingForConfig` / `configured` / `noConfig`）；<br/>2. 加载失败工具保留 `rawInputs` 与 `config`，二次保存不丢失历史配置；<br/>3. 画布 `uiWorkflow2StoreWorkflow` 区分展开态与存储态工具序列化 |
| **前端资源/沙盒巡检、技能联动与知识库参数** | [`projects/app/test/web/core/workflow/check/check.test.ts`](../../../projects/app/test/web/core/workflow/check/check.test.ts)<br/>[`projects/app/test/pageComponents/app/detail/Edit/FormComponent/checkAppForm.test.ts`](../../../projects/app/test/pageComponents/app/detail/Edit/FormComponent/checkAppForm.test.ts)<br/>[`projects/app/test/pageComponents/app/detail/Edit/ChatAgent/hooks/useAgentSkillSelect.test.ts`](../../../projects/app/test/pageComponents/app/detail/Edit/ChatAgent/hooks/useAgentSkillSelect.test.ts)<br/>[`projects/app/test/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SelectDatasetParams.utils.test.ts`](../../../projects/app/test/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SelectDatasetParams.utils.test.ts)<br/>[`projects/app/test/web/core/app/workflow/utils.test.ts`](../../../projects/app/test/web/core/app/workflow/utils.test.ts) | 1. `checkAgentResourceIssues` 与 `checkAgentSandboxIssues` 统一覆盖画布巡检、表单校验与预览 `resourceNodes` 快照；<br/>2. 选择技能自动开启沙盒、移除技能前阻止关闭沙盒及系统/套餐不可用拦截；<br/>3. 知识库参数读写、标签过滤裁剪与导出敏感信息脱敏（保留变量引用元组） |
| **聊天展示与非流式响应兼容** | [`projects/app/test/components/core/chat/ChatContainer/ChatBox/agentAsk.test.ts`](../../../projects/app/test/components/core/chat/ChatContainer/ChatBox/agentAsk.test.ts)<br/>[`projects/app/test/service/core/chat/completionResponse.test.ts`](../../../projects/app/test/service/core/chat/completionResponse.test.ts) | 1. 静默模式（`hideInUI: true`）下触发 `ask_user` 时，前端对话气泡与非流式 completion 响应正常保留并渲染 `interactive` |

### 8.2 工作流编排、跨节点嵌套与端到端集成测试场景

| 场景类别 | 拓扑结构 | 核心验证结果 |
| --- | --- | --- |
| **基础流式与多轮工具调用** | `Start -> Agent(含子流程工具) -> 指定回复` | 流式输出思考过程与正文；调用子工作流工具前后文本完整汇总进 `answerText` 传给下游 `指定回复`，聊天气泡不重复追加；`运行详情` 将内部步骤收纳于外层 `Agent` 节点下 |
| **`ask_user` 暂停与恢复汇总** | `Start -> Agent(ask_user) -> 指定回复` | 暂停前输出引导文案并展示 `ask_user` 卡片；恢复后本轮气泡仅展示新增回复，而下游 `指定回复` 收到的 `answerText` 完整拼接暂停前与恢复后文本 |
| **静默模式与 `ask_user` 交互** | `Start -> Agent(隐藏AI输出, ask_user) -> 指定回复` | 关闭可见 SSE 且不向顶层写入普通 `assistantResponses`；触发 `ask_user` 暂停时提问卡片与非流式 API 响应均保持可见，恢复完成后下游正常消费完整 `answerText` |
| **异常捕获 (`catchError`)** | `Start -> Agent(catchError=true/false) -> 指定回复` | 开启 `catchError` 且模型报错时，外层 `Agent` 与内部 `主 agent 调用` 均标记 `errorCaptured: true`，不弹橙色未捕获报错卡片，沿 `source_catch` 边由下游 `指定回复` 输出 `errorText`；关闭 `catchError` 时正常展示错误提示并阻断成功分支 |
| **嵌套子工作流 (`appModule`)** | `Parent -> SubWorkflow(history=0) -> Child Agent(ask_user)` | `childrenInteractive` 正常包装且无 `nodeOutputs.history` 循环引用；子 `Agent` 通过 `memoryState` 作用域独立恢复上下文，不受父级 `history=0` 影响 |
| **嵌套 Agent (`ToolCall -> Agent`)** | `Start -> ToolCall -> Child Agent(isTool=true)` | 工具 Schema 仅暴露 `userChatInput`（必填）与 `fileUrlList`（选填）；支持父 `ToolCall` 调用子 `Agent` 及 `toolChildrenInteractive` 跨层 `ask_user` 暂停恢复 |
| **循环容器 (`LoopRun`)** | `Start -> LoopRun([Item1, Item2]) -> Agent(ask_user)` | 第 1 轮迭代触发 `ask_user` 暂停并恢复完成后，自动清理未完成交互历史并进入第 2 轮迭代，第 2 轮迭代正常以 `user` 消息接收新输入 |
| **多 Agent 串联（同轮恢复与跨轮历史）** | `Start -> Agent#1(静默/ask_user) -> Agent#2(公开)` | 同轮 `Agent#1` 恢复完成后通过 `rewriteHistories` 清理交互链，下游 `Agent#2` 不误把自身输入当作 `ask_user` 回答；跨轮对话中前置静默 `Agent#1` 不污染 `Agent#2` 的历史上下文或覆盖用户首轮提问 |
| **画布 UI 与资源卡片交互** | `NodeAgent`（技能 / 工具 / 知识库卡片 & 容器约束） | `parallelRun` 禁用、`loopRun` 允许；技能/工具/知识库资源卡片统一为 `40px` 紧凑高度，绝对定位悬浮操作按钮无布局抖动，长名称截断按需展示 Tooltip |

## 9. 实施与验证 Todo

- [x] 开放应用侧 Agent 模板并纳入交互节点约束。
- [x] 模板控制可见输入顺序，弹窗附属字段隐藏。
- [x] 移除工具对象上的派生配置状态，保留加载失败工具的原始配置。
- [x] 统一 Agent 资源规则和沙盒规则，接入巡检、发布、调试及预览发送。
- [x] 独立 Agent 与工作流共享技能/沙盒 Hook、提示词资源管理及 40px 紧凑资源卡片。
- [x] Agent/ToolCall 使用标准输入渲染管线，删除节点专属的重复沙盒行。
- [x] 静默输出保留恢复上下文，支持工具/子应用作用域下的交互暂停上下文恢复、跨轮次 `answerText` 拼接与历史清理，补齐工具返回与 `catchError` 错误捕获行为。
- [x] 支持隐藏标签过滤参数验证、知识库删除后过滤条件清理与导出敏感信息过滤。
- [x] 支持 `ChatAgent` 作为子应用与 Agent 工具被引用，统一 `runChildAppWorkflow` 执行入口并逐层汇总 `hasAgentSandbox` 沙盒启用状态。
- [x] 完成本次改动及受影响代码的局部测试、类型检查、定向 lint 与浏览器 E2E 实测验收。
