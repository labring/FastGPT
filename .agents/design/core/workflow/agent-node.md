# 工作流 Agent 节点技术方案

## 1. 目标与能力边界

将已有独立 Agent 的 Agent Loop 能力开放为工作流标准节点，复用同一套执行器、工具配置、技能管理和资源校验。节点按模板声明输入，表单与工作流编辑器仅适配各自的数据更新方式。

| 项目 | 行为约定 |
| --- | --- |
| 开放范围 | 注册到 `appSystemModuleTemplates`，供工作流应用使用；不加入 `pluginSystemModuleTemplates`，不扩大辅助生成白名单 |
| Agent 能力 | 保留任务规划、工具/子应用调用、技能、沙盒、知识库、对话文件、上下文压缩和 `ask_user` |
| 工具连接 | 模板 `isTool: true`，允许挂在工具调用节点下；提示词、历史、用户问题沿用通用输入来源切换 |
| 交互约束 | 加入 `INTERACTIVE_NODE_TYPES`，沿用交互节点的评测与并行容器限制 |
| 输出 | 正常返回 `answerText`；工具调用方获得 `toolResponse`；错误交给节点的 `catchError` 分支 |
| 静默模式 | 关闭 `aiChatIsResponseText` 后抑制可见 SSE 并隐藏响应展示，保留完整恢复上下文、交互、节点输出和运行详情 |

## 2. 模板是输入布局与能力来源

模板位置：`packages/global/core/workflow/template/system/agent/index.ts`。

可见输入固定按以下顺序声明：

1. AI 模型。
2. 提示词。
3. 虚拟机。
4. 技能。
5. 工具。
6. 知识库。
7. 聊天记录。
8. 文件链接。
9. 用户问题。

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

可用工具按当前完整输入投影稀疏来源配置，过滤最终由 Agent 生成的固定值。子应用历史参数使用 Agent 的 `maxHistories`。

画布保存先识别完整编辑详情并调用统一序列化器；已是 `AgentToolSchema` 的稀疏记录直接保留。禁止把稀疏输入强制断言为 NodeIO 再序列化。

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

`getDatasetSearchParams` 与运行时保持嵌套 `datasetParams` 优先的兼容顺序，不用 truthy 判断覆盖 `false` 或 `0`。参数编辑、权限开关和标签过滤清理通过同一转换器批量回写当前输入与旧嵌套结构，避免维护重复同步分支。编辑知识库列表时也同步旧结构。移除知识库后通过共享 `useDatasetTagFilterPrune` 清理不再可用的标签条件，移除全部知识库时也执行清理。

`collectionFilterMatch` 保留隐藏手动输入与标准 `reference` 两种来源，整项变量引用按 `[nodeId, outputKey]` 保存，接入通用引用检查和运行时解析；两种模式都只在参数弹窗编辑，画布不生成重复输入行。Core 校验仍按 key 将结构化手动条件转换为运行时字符串。旧 `datasetParams.collectionFilterMatch` 的整项引用由同一过滤参数归一化器解析，保持与顶层输入一致。

知识库使用变量引用时无法在编辑期确定自定义标签，手动条件不作为有效配置保留，应改用变量生成完整过滤 JSON；整项变量引用不会进入手动标签清理逻辑。固定知识库继续使用标签交集配置条件，系统属性条件不依赖自定义标签元数据。

## 6. 执行与恢复约定

### 6.1 文件与作用域

- 独立 Agent 与工作流 Agent 均通过 `fileUrlList` 输入控制当前文件传入与历史文件解析，具体媒体能力仍由所选模型限制。
- 继续使用 `WorkflowMemoryState` 的节点/子应用作用域，不新增并列 memory 系统。
- `Agent` 作为子工具或子应用运行时，父级会将子 `Agent` 的展示输出标为 `displayOnly: true`（或子应用传入空 `histories`）以隔离父模型上下文。`FastAgent` 进入 `interactive` 暂停时，按 `getWorkflowNodeMemoryKey` 作用域键保存当前节点的完整非 `displayOnly` `transcript`（`[...requestMessages, { dataId: responseChatItemId, obj: AI, value: outputAssistantResponses }]`）；交互恢复（`lastInteractive`）时通过 `readWorkflowNodeMemory`（`hasInteractiveResume: true`）优先恢复自身 `transcript` 与 `activePlan`，保证 `inputContext`、已执行工具调用、`plan` 及 `ask_user` 工具响应完整续接；节点完成或异常结束时将该作用域键置为 `undefined` 清理。

### 6.2 静默输出

`aiChatIsResponseText === false` 时：

1. workflow adapter 关闭正文、思考、工具 SSE；共享 event stream 同时拦截 plan 与 planStatus。
2. 与 `AI 对话` / `工具调用` 节点保持一致，不向工作流顶层返回 `assistantResponses`（返回 `undefined`），避免多节点串联时静默节点的 `inputContext` 和内部输出污染后续节点的对话历史。
3. 暂停恢复所需的 `inputContext`、模型原始工具调用、计划与交互记录由节点作用域 `memoryState`（`getWorkflowNodeMemoryKey`）独立保存并在恢复时读取。
4. `interactive` 继续返回，追问由底部输入区处理；`answerText`、`toolResponse`、usage 与 nodeResponse sink 正常工作。

### 6.3 错误与工具返回

Agent 内部工具错误交由 Agent Loop 消化。节点级错误保留原始错误和 `errorText`；开启 `catchError` 时不再把结束错误文本追加为聊天正文。未开启时保留既有可见错误行为。

成功完成返回纯文本 `toolResponse`，节点级失败返回 `{ error }`，供外层工具调用消费。交互暂停继续返回交互状态与恢复数据，不伪造完成返回值。

## 7. 导出过滤

开启敏感信息过滤后清空 Agent 的技能、工具、知识库与旧 `datasetParams.datasets`，剥离提示词中的 `{{@...@}}` 资源引用标签，并更新相应多语言说明。资源详情不成为新的持久化协议。

## 8. 实施与验证 Todo

- [x] 开放应用侧 Agent 模板并纳入交互节点约束。
- [x] 模板控制可见输入顺序，弹窗附属字段隐藏。
- [x] 移除工具对象上的派生配置状态，保留加载失败工具的原始配置。
- [x] 统一 Agent 资源规则和沙盒规则，接入巡检、发布、调试及预览发送。
- [x] 独立 Agent 与工作流共享技能/沙盒 Hook、提示词资源管理及卡片。
- [x] Agent/ToolCall 使用标准输入渲染管线，删除节点专属的重复沙盒行。
- [x] 静默输出保留恢复上下文，支持工具/子应用作用域下的交互暂停上下文恢复与清理，补齐工具返回与错误捕获行为。
- [x] 支持隐藏标签过滤参数验证、知识库删除后过滤条件清理与导出敏感信息过滤。
- [x] 完成本次改动及受影响代码的局部测试、类型检查与定向 lint。
- [ ] 用户验收交互布局与真实模型、技能、沙盒、追问续跑行为。

验证记录：19 个局部测试文件、615 个用例通过；应用 TypeScript 检查、改动源文件的 ESLint（零代码警告）及 workflow-core 构建通过。按仓库约定未运行全量测试。
