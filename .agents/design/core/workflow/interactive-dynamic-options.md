# 用户选择与表单输入选项动态化设计文档

## 1. 背景与目标

工作流中的两类交互节点需要让最终用户在对话端做出选择或填写：

- **用户选择节点（`userSelect`）**：向用户展示一段说明文字与一组可选项，用户点选其一作为后续分支依据，输出单个选择结果。
- **表单输入节点（`formInput`）**：向用户展示多字段表单，其中部分字段为下拉单选（`select`）或下拉多选（`multipleSelect`），用户选择后提交，输出表单键值结果。

此前这两类节点的候选项仅支持手动逐条填写固定值。当候选项需要随上游节点查询数据或全局变量动态变化时，固定手填方式无法满足需求。

### 1.1 核心目标

1. **用户选择节点支持变量引用选项**：`userSelectOptions` 支持在「手动输入」与「变量引用」间切换，支持多选变量引用；引用模式下收敛为单一右侧连接句柄 `ref_default`，运行期按顺序展开候选，若解析后无可用选项则报错拦截。
2. **表单输入节点单选/多选支持变量引用选项**：`select` 与 `multipleSelect` 字段支持将「选项配置」切换为「变量引用」，引用模式下隐藏默认值，运行期动态生成下拉选项，若解析后无可用选项则报错拦截。
3. **统一的变量类型过滤与运行期展开规则**：下拉选择器排除 `arrayBoolean`；运行期对声明为 `array*`（或运行期值为数组）的来源逐元素展开并字符串化，对其他类型整体字符串化作为单个选项，且不去重。
4. **对齐 `upstream/main` 的失效引用清理与静态检查机制**：前端 `MultipleReferenceSelector` 保持 `upstream/main` 口径，仅渲染当前可选的有效引用标签（失效引用不展示红色「无效值」标签，全部失效时回退展示占位符）；保存时通过 `filterUnselectableReferenceInputs` 统一剔除不可选引用；运行/发布静态检查时，若不存在任何有效引用则统一按必填为空拦截（`userSelect` 报 `user_select_empty`，`formInput` 报 `required_input_empty`）。
5. **大选项量端上体验**：表单下拉在选项数 `> 10` 时提供面板内搜索过滤，多选下拉在选项数 `>= 5` 时提供「全部」快捷项，样式对齐 `TagFilter`。

---

## 2. 数据结构与 Schema 设计

### 2.1 用户选择节点模板（`packages/global/core/workflow/template/system/interactive/userSelect.ts`）

- 新增统一引用出口句柄常量与默认手填选项：

```ts
export const USER_SELECT_REFERENCE_HANDLE_KEY = 'ref_default';

export const defaultUserSelectOptions: UserSelectOptionItemType[] = [
  { value: 'Confirm', key: 'option1' },
  { value: 'Cancel', key: 'option2' }
];
```

- 将 `NodeInputKeyEnum.userSelectOptions` 的 `renderTypeList` 扩展为同时支持手填与引用：

```ts
{
  key: NodeInputKeyEnum.userSelectOptions,
  renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
  selectedTypeIndex: 0,
  valueType: WorkflowIOValueTypeEnum.any,
  label: i18nT('workflow:list_options'),
  required: true,
  value: defaultUserSelectOptions
}
```

### 2.2 表单输入字段 Schema（`packages/global/core/workflow/template/system/interactive/type.ts`）

在 `UserInputFormItemSchema` 中新增选项来源类型 `listInputType` 与变量引用列表 `listReference`：

```ts
listInputType: z.enum(FlowNodeInputTypeEnum).optional().meta({
  description: '选项配置方式（custom 手动填写 / reference 引用变量）'
}),
listReference: ReferenceValueTypeSchema.optional().meta({
  description: '动态选项引用变量列表'
})
```

---

## 3. 引用变量类型约束与运行期展开规则

### 3.1 下拉候选类型过滤（`projects/app/src/web/core/workflow/utils.ts`）

在 `filterSelectableWorkflowNodeOutputs` 与 `workflowReferenceValueIsSelectable` 中支持 `excludeValueTypes`，并通过 `DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES` 统一排除 `arrayBoolean`：

```ts
export const DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES: WorkflowIOValueTypeEnum[] = [
  WorkflowIOValueTypeEnum.arrayBoolean
];
```

| 来源变量类型 | 下拉是否可选 | 运行期转换规则 |
| --- | --- | --- |
| `arrayString` / `arrayNumber` / `arrayObject` / `arrayAny`（或运行期值为数组） | ✅ | 逐元素展开，每个元素转换为字符串作为一个选项（对象/嵌套结构使用 `JSON.stringify`） |
| `string` / `number` / `boolean` / `object` / `any`（运行期值为非数组） | ✅ | 整体转换为字符串作为单个选项 |
| `arrayBoolean` | ❌ | 下拉选择器中排除不展示 |

### 3.2 运行期选项解析器（`packages/service/core/workflow/dispatch/interactive/dynamicOptions.ts`）

`resolveDynamicOptionStrings` 接收 `{ value, runtimeNodesMap, variables }`，执行流程如下：

1. **兼容单步调试手填值（对齐 `getReferenceVariableValue`）**：
   - 使用 `isValidReferenceValueFormat(item, runtimeNodesMap)` 判断输入是否为指向全局变量（`VARIABLE_NODE_ID`）或 `runtimeNodesMap` 中已有节点的有效引用二元组。
   - 若 `value` 不是有效引用结构（例如节点「单步调试」时 `useDebugInput` 渲染手动输入框并通过 `getDebugRuntimeInputs` 注入的字面量字符串或 JSON 数组），直接按第 3 步规则将 `value` 展开并格式化为选项列表。
2. **解析单来源运行值**：
   - 全局变量（`sourceNodeId === VARIABLE_NODE_ID`）：从 `variables[outputId]` 取值。
   - 节点输出（`sourceNodeId !== VARIABLE_NODE_ID`）：从 `runtimeNodesMap.get(sourceNodeId)?.outputs` 查找对应输出项的 `value`。
3. **展开与格式化**：
   - `rawValue === undefined || rawValue === null` 时跳过。
   - 当 `Array.isArray(rawValue)` 为真时，逐元素调用 `formatSingleOptionValue`（非空字符串原样保留，对象 `JSON.stringify`，其余 `String(val)`，空串跳过）。
   - 当 `rawValue` 为非数组值时，将 `rawValue` 整体传入 `formatSingleOptionValue` 作为单个选项。
4. **顺序拼接（不去重）**：按勾选顺序追加到结果数组，保留重复项。

---

## 4. 工作流运行调度设计

### 4.1 节点入参预处理（`packages/service/core/workflow/dispatch/utils/runtime.ts`）

在 `getWorkflowNodeRunParams` 中，当 `input.key === NodeInputKeyEnum.userSelectOptions` 时，保留原始 `input.value` 不做常规 `getReferenceVariableValue` 扁平化，交由 `dispatchUserSelect` 结合 `runtimeNodesMap` 与 `variableState` 统一解析。

### 4.2 用户选择节点调度（`packages/service/core/workflow/dispatch/interactive/userSelect.ts`）

1. **首次进入（返回交互暂停请求）**：
   - 若为引用模式，调用 `resolveDynamicOptionStrings` 生成 `{ key: 'option_${index + 1}', value }[]`。
   - 若引用模式下 `resolvedOptions.length === 0`，直接抛出 `new Error(i18nT('workflow:user_select_no_available_options'))`，由工作流异常处理链路接管。
2. **恢复执行（用户点选后继续）**：
   - 手填模式：跳过未选中的 `option.key` 句柄，仅激活命中分支。
   - 引用模式：`skipHandleId` 返回空数组 `[]`，流程统一沿唯一的 `ref_default` 句柄继续，并将用户所选文本写入 `NodeOutputKeyEnum.selectResult`。

### 4.3 表单输入节点调度（`packages/service/core/workflow/dispatch/interactive/formInput.ts`）

- 首次进入返回 `userInput` 交互参数前，遍历 `userInputForms`：
  - 对 `select` / `multipleSelect` 且 `listInputType === FlowNodeInputTypeEnum.reference` 的字段，调用 `resolveDynamicOptionStrings` 生成 `list: [{ label: value, value }]`，并将 `defaultValue` 置为 `undefined`。
  - 若解析后 `list.length === 0`，抛出 `new Error(i18nT('workflow:form_input_no_available_options'))`，避免返回无可用选项的交互表单。

---

## 5. 前端交互与画布连线设计

### 5.1 用户选择节点画布与连线迁移（`NodeUserSelect.tsx` / `ConnectionHandle.tsx` / `edge.ts`）

1. **模式切换器**：在 `RenderInput/Label.tsx` 中为 `userSelectOptions` 渲染 `NodeInputSelect`（手动输入 / 变量引用）。
2. **连线迁移规则（`Label.tsx`）**：
   - 无论从「手动输入 $\rightarrow$ 变量引用」还是「变量引用 $\rightarrow$ 手动输入」，切换时均将选项值重置为默认态（引用模式为 `[]`，手填模式为 `defaultUserSelectOptions`）。
   - 同时扫描当前节点的出边，定位首个已连线的 `sourceHandle`，**将该句柄上的所有出边统一迁移至新模式的首个句柄**（引用模式为 `getHandleId(nodeId, 'source', 'ref_default')`，手填模式为 `getHandleId(nodeId, 'source', 'option1')`），其余分支句柄上的多余连线自动清理。
3. **单一引用句柄渲染**：
   - 引用模式下，在 `MultipleReferenceSelector` 右侧渲染单个 `MySourceHandle`（`handleId = getHandleId(nodeId, 'source', 'ref_default')`）。
   - 节点折叠（`ConnectionHandle.tsx`）及连线排序（`edge.ts`）同步识别引用模式下的 `ref_default` 句柄。

### 5.2 表单输入与全局变量选项配置弹窗（`InputTypeConfig.tsx` / `InputFormEditModal.tsx` / `VariableEditModal/index.tsx`）

1. **表单布局与对齐**：
   - 弹窗右侧配置区使用双列 Grid（`gridTemplateColumns = 'minmax(64px, max-content) minmax(0, 1fr)'`），手填选项列表通过 `gridTemplateColumns = 'subgrid'` 共享左列宽度，确保切换类型或新增至 `选项 10+` 时输入框左侧垂直对齐且不发生布局抖动。
2. **默认值内联与禁用态**：
   - 单选框（Radio）与多选框（Checkbox）的「默认值」紧随每个手填选项右侧内联展示；当选项值为空时设为禁用态（`cursor: not-allowed`，Checkbox 禁用态去除灰色填充背景，与 Radio 圆框保持一致）；当选项文本被清空时，同步从 `defaultValue` 中移除对应项。
   - 在 `单选框` 与 `多选框` 之间切换时，保留已配置的选项列表（`list` / `listInputType` / `listReference`），仅重置 `defaultValue`。
3. **变量引用模式**：
   - 仅在 `type === 'formInput'` 的单选/多选字段中渲染「选项配置」行与切换器（手动输入 / 变量引用）；全局变量与插件输入不渲染该行。
   - 切换为「变量引用」时隐藏默认值，清空 `defaultValue`，按需挂载 `DynamicOptionReferenceSelector`（避免非工作流场景访问工作流上下文）。
   - 弹窗点击「确认」提交时，若处于「变量引用」模式且 `listReference` 为空，提示选择变量并阻止提交。
   - `MultipleRowArraySelect` 使用 `<Menu strategy="fixed" closeOnSelect={false}>` 挂载下拉面板，避免在弹窗 `overflow: auto` 容器内被裁剪。

### 5.3 对话端大选项量体验（`MySelect` / `MultipleSelect` / `formRender`）

- 在 `formRender/index.tsx` 中，针对 `InputTypeEnum.select` 与 `InputTypeEnum.multipleSelect`：
  - **面板内搜索**：当 `list.length > 10` 时开启 `isSearch`，下拉顶部渲染 `FilterSearchInput` 按文本过滤候选。
  - **多选「全部」快捷项**：多选下拉当 `list.length >= 5` 时开启 `setIsSelectAll`，顶部渲染「全部」选项；仅有「全部」时下方展示分割线，同时存在「全部」与搜索框时不展示多余分割线，视觉与交互对齐 `MultiSelectFilter`。

---

## 6. 工作流引用清理与静态检查（对齐 `upstream/main`）

1. **UI 与保存清理口径（`Reference.tsx` & `WorkflowComponents/utils.ts`）**：
   - 对齐 `upstream/main`（PR #7324）：`MultipleReferenceSelector` 仅渲染当前在 `referenceList` 中匹配到的有效引用标签，不展示红色「无效值」标签；当所有引用均失效时展示 `placeholder`。
   - `filterUnselectableReferenceInputs` 在保存/转换工作流时，通过 `workflowReferenceValueIsSelectable`（对动态选项传入 `excludeValueTypes: DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES`）自动清理已删除节点、已删除输出、断开连线或类型不匹配的失效引用（含 `userSelectOptions` 及 `formInput` 字段中的 `listReference`）。
2. **连线句柄合法性（`check/graph.ts`）**：
   - `isWorkflowEdgeSourceHandleValid` 对处于引用模式的 `userSelect` 节点校验 `sourceHandle === getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY)`，保证引用出口的连线参与图可达性计算。
3. **节点输入校验（`check/node.ts`）**：
   - 对齐 `upstream/main` 中 `variableUpdate` 与必填引用输入的检查语义（不单独报 `invalid_reference`）：
     - `userSelect` 引用模式下：当未选任何引用或所选引用均已失效时，报 `user_select_empty`；同时在通用必填检查中跳过 `userSelectOptions`，避免重复报出 `required_input_empty`。
     - `formInput` 单选/多选字段引用模式下：当未选任何引用或所选引用均已失效时，报 `required_input_empty`。

---

## 7. Todo

- [x] 扩展 `UserSelectNode` 模板与 `UserInputFormItemSchema` 支持引用变量选项配置
- [x] 实现 `DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES` 下拉类型过滤（排除 `arrayBoolean`）
- [x] 实现 `resolveDynamicOptionStrings` 运行期按声明类型展开 `array*` 与单值化其他类型，并兼容单步调试手填值
- [x] 实现 `dispatchUserSelect` 与 `dispatchFormInput` 动态选项解析及空选项报错拦截
- [x] 实现 `NodeUserSelect` 手填/引用切换连线迁移与 `ref_default` 句柄渲染
- [x] 重构 `InputTypeConfig` 单选/多选配置布局、内联默认值禁用态与弹窗变量引用选择
- [x] 实现 `MySelect` / `MultipleSelect` 大选项量搜索过滤（`> 10`）与多选「全部」选项（`>= 5`）
- [x] 对齐 `upstream/main` 引用清理与工作流静态检查并补充单元测试

