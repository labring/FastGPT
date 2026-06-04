# 变量更新节点 - 类型操作扩展

> Notion 同步源：https://www.notion.so/dighuang/342ded3f8cd8818c9dbaf8e7f3eabb57
> 创建日期：2026-04-14
> 状态：设计定稿，准备落地

## 1. 目标

`NodeVariableUpdate`（变量更新节点）当前对非 string 类型变量的操作方式缺失，需扩展支持：

- **Number**【P0】：公式计算（`+ − × ÷ =`）
- **Boolean**【P0】：True / False / Negate（取反）
- **Array**【P1】：Append（追加）/ Clear（清空）/ Equal（等于/整数组替换，与 Number 的 `=` 语义对称）

String 保持现状。

## 2. 核心设计原则

**渲染派发 与 操作语义 解耦**：

| 职责 | 由什么决定 | 是否持久化 |
| --- | --- | --- |
| 渲染什么控件 | 目标变量的 `valueType`（运行时推断） | ❌ 不存 |
| 当前操作的子配置 | 新增三个字段 | ✅ 存 |
| 运行时行为 | 新字段 + 旧值 | 由 `runUpdateVar.ts` 消费 |

- 渲染派发永远是 `switch(valueType)`，不看新字段
- `renderType: input | reference` 继续作为「手动输入 vs 引用」的底层切换
- 新字段仅承载 UI 内的「操作模式选中态」，不决定渲染何种组件
- 唯一例外：`arrayMode` 会间接影响递归子节点的 `valueType`（append 时降级元素类型再递归）

## 3. 类型扩展

```typescript
// packages/global/core/workflow/template/system/variableUpdate/type.ts
type TUpdateListItem = {
  variable?: ReferenceItemValueType;
  value?: ReferenceValueType;
  valueType?: WorkflowIOValueTypeEnum;
  renderType: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;
  // 新增
  numberOperator?: '+' | '-' | '*' | '/' | '=';
  booleanMode?: 'true' | 'false' | 'negate';
  arrayMode?: 'append' | 'clear' | 'equal';
};
```

存储层使用 ASCII 符号 `+ - * / =`，UI 层显示 `+ − × ÷ =`。

## 4. 前端渲染分派

**实现策略**（相对初版简化）：Array 不再递归 `ValueRenderer`，直接在 `ArrayValue` 中按元素类型映射 `InputRender`。
原因：append 的 value 是单元素而非嵌套 Array，递归带入 `NumberFormula` 的运算符语义（旧值 OP 输入值）在"追加"场景下没意义；
直接映射 `elementInputTypeFor(arrayXxx)` 更简单，也能覆盖 string→PromptEditor（带 `/`）、number→numberInput、boolean→switch、object→JSONEditor。

```
ValueRenderer(valueType, renderType):
  renderType=reference → VariableSelector(valueType)     // 任意类型都走整值引用
  renderType=input  + string   → InputRender(textarea 或目标变量特殊类型)
  renderType=input  + number   → NumberFormula
  renderType=input  + boolean  → BooleanSelect
  renderType=input  + array    → ArrayValue

ArrayValue(arrayMode):
  equal   → InputRender(JSONEditor)                     // 整数组
  append  → InputRender(elementInputTypeFor(valueType))  // 单元素
  clear   → (无输入)
```

顶部「值」label 右侧统一是「手动输入 / 引用」toggle；Array 模式下拉（等于/追加/清空）仅在 input 分支下由 `ArrayValue` 自己渲染。

### 4.1 String
- 手动输入：`InputRender(textarea)` → PromptEditor（与数据库搜索节点一致，带 `/` 变量选择）
  - 例外：目标变量是 `select / switch / numberInput / fileSelect` 等特殊 `VariableInputEnum`，保留推断出的 `inputType`
- 引用：`VariableSelector(valueType=string)`

### 4.2 Number【P0】
- 手动输入：行内 `[运算符下拉] [numberInput]`
  - 运算符直接以符号显示：`+ − × ÷ =`（**不走 i18n**）
  - `=` 直接赋值；其余为 `旧值 OP 输入值`
- 引用：仅支持直接赋值（无运算符），`VariableSelector(valueType=number)`

### 4.3 Boolean【P0】
- 手动输入：单个下拉 —— `是` / `否` / `取反`
- 引用：`VariableSelector(valueType=boolean)`

### 4.4 Array【P1】
- 手动输入：顶部「Array 模式下拉」`等于 / 追加 / 清空`，body 按 mode 渲染
  - **equal**：`InputRender(JSONEditor)` 整数组
  - **append**：按 `elementInputTypeFor(valueType)` 映射 `InputRender`
  - **clear**：无输入区
- 引用：**不显示**模式下拉，直接 `VariableSelector(valueType=arrayXxx)` 选整个数组

## 5. 运行时执行逻辑（`runUpdateVar.ts`）

在现有「读 value → `valueTypeFormat` → 赋值」前插入类型分派：

```typescript
const oldValue = readOldValue(varNodeId, varKey); // 从 variables 或 node.outputs
let newValue = computedValue;

// 所有操作字段仅在 renderType === 'input' 时生效
const isInput = item.renderType === FlowNodeInputTypeEnum.input;

if (isInput && valueType === 'number' && numberOperator && numberOperator !== '=') {
  const a = Number(oldValue) || 0;
  const b = Number(newValue) || 0;
  newValue = applyOp(a, numberOperator, b);
}

if (isInput && valueType === 'boolean' && booleanMode) {
  if (booleanMode === 'true') newValue = true;
  else if (booleanMode === 'false') newValue = false;
  else if (booleanMode === 'negate') newValue = !Boolean(oldValue);
}

if (isInput && isArrayType(valueType)) {
  const oldArr = Array.isArray(oldValue) ? oldValue : [];
  if (arrayMode === 'clear') newValue = [];
  else if (arrayMode === 'append') newValue = [...oldArr, newValue];
  // equal / undefined：直接替换（rawValue 已是整数组）
}
// reference 模式下 arrayMode 一律忽略，rawValue 是 referenced 整数组，直接赋值
```

### 5.1 append 的 `valueTypeFormat` 边界
现状 `valueTypeFormat(val, item.valueType)` 使用外层数组类型，append 分支下应改用**元素类型**对单个输入值做格式化，再推入数组。

### 5.2 `updateList` 顺序语义
同一节点多条 update 依次执行，后一条读到的 `oldValue` 是前一条写入后的新值（因为 `variables[varKey]=value` 与 `output.value=value` 即时写入）。**运行时必须保持顺序执行**，后续不得改为并行/批量写入。

## 6. 老数据兼容（零迁移）

- 无 `numberOperator` → 按 `=` 处理
- 无 `booleanMode` → 按直接赋值处理（`value[1]` 为字面量）
- 无 `arrayMode` → 按 `manual` 处理
- 无需迁移脚本

## 7. 开放问题定稿决议

| 问题 | 决议 |
| --- | --- |
| Number 除法遇 0 | **保持旧值** + 运行时 warning 日志（符合 FastGPT 失败降级风格） |
| Boolean negate 旧值非 boolean | 按 `!Boolean(oldValue)` 处理 |
| Array append 旧值非数组 | 退化为 `[newValue]` |
| Array append 引用模式下元素类型为 `any` | 允许选任意引用（交由用户保证一致性，与现状 any 类型行为一致） |
| Array 模式下拉位置 | 独立一行，位于「值」label 下方（避免与运算符行视觉冲突） |
| 切换 Array 模式时是否清空 value | **清空**（`value: undefined`），避免残留脏数据；切换 Number/Boolean 模式同样清空 |
| clear 模式下的 `renderType` | 保留上次值，运行时忽略，不影响序列化 |
| 切换目标变量时的默认值 | onSelect 调用 `getDefaultsForValueType(valueType)` 统一派默认：number→`numberOperator='='`；boolean→`booleanMode='true', value=['', true]`；array→`arrayMode='equal'`。保证 UI 初始态与 runtime 默认行为一致（否则 boolean 会出现 UI 显示「是」但 runtime 写 `false` 的错配） |

## 8. 前置重构：组件拆分

当前 `NodeVariableUpdate.tsx` 单文件 380 行，`ValueRender` 用 `useMemoizedFn` 包裹规避重渲染，已逼近可维护上限。

### 目录结构

```
Flow/nodes/NodeVariableUpdate/
  index.tsx              ← NodeCard 外壳、列表管理、"值"label + toggle、目标变量选择
  ValueRenderer.tsx      ← 按 renderType / valueType 派发到具体 renderer
  VariableSelector.tsx   ← 抽出的变量选择器
  renderers/
    NumberFormula.tsx
    BooleanSelect.tsx
    ArrayValue.tsx       ← 自带模式下拉 + 直接映射 InputRender（不递归 ValueRenderer）
```

### 循环依赖处理
实现阶段发现 Array append 单元素根本不需要 `NumberFormula` / `BooleanSelect` 等带有"操作语义"的组件
（append 本身就是一个操作，再嵌套一层运算符没意义），所以放弃了递归方案：`ArrayValue` 直接按
`elementInputTypeFor(arrayXxx)` 映射到 `InputRender` 的基础输入控件即可。无循环依赖。

### 为什么不复用 `InputRender` 扩展 `FlowNodeInputTypeEnum`
（来自 Notion 六点论证：value 形状不一致、运行时语义不能由 renderType 承载、`renderTypeList` 语义不匹配、仅此节点使用、动态 valueType、派发表 ≠ 复用。此处不展开。）

## 9. i18n 清单

运算符符号不 i18n。仅下列 key：

```
workflow:var_update_boolean_true
workflow:var_update_boolean_false
workflow:var_update_boolean_negate
workflow:var_update_array_append
workflow:var_update_array_clear
workflow:var_update_array_equal
```

## 10. 测试策略（vitest）

`packages/service/` 或 `test/` 下新增 `runUpdateVar.test.ts`：

- Number：`+ − × ÷ =` 五种运算；除零保持旧值
- Boolean：`true/false/negate`；旧值非 boolean 场景
- Array：`append`（旧值数组、非数组、元素类型降级格式化）、`clear`、`manual`
- Reference 模式下：确认 `numberOperator / booleanMode` 被忽略
- 顺序语义：单节点多条 update，后一条读到前一条写入值

## 11. 相关文件

- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeVariableUpdate/`
  - `index.tsx` — NodeCard 外壳 + `getDefaultsForValueType` + 列表管理
  - `ValueRenderer.tsx` — 按 renderType / valueType 派发
  - `VariableSelector.tsx` — 变量选择器
  - `renderers/{NumberFormula,BooleanSelect,ArrayValue}.tsx`
- `packages/service/core/workflow/dispatch/tools/runUpdateVar.ts`
- `packages/global/core/workflow/template/system/variableUpdate/type.ts`
- `test/cases/service/core/workflow/dispatch/tools/runUpdateVar.test.ts`
- `packages/web/components/common/Icon/icons/math/*.svg` + `constants.ts`
- `packages/web/i18n/{en,zh-CN,zh-Hant}/workflow.json`

## 12. TODO

见同目录 `todo.md`。
