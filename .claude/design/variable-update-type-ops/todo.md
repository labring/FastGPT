# TODO — 变量更新节点类型操作扩展

> 设计见同目录 `design.md`

## Phase 1：类型 & 运行时（后端，先行）

- [x] 扩展 `TUpdateListItem` 类型，新增 `numberOperator / booleanMode / arrayMode`
- [x] `runUpdateVar.ts`：添加 oldValue 读取工具函数
- [x] `runUpdateVar.ts`：Number 公式分派（含除零保持旧值）
- [x] `runUpdateVar.ts`：Boolean `true/false/negate` 分派
- [x] `runUpdateVar.ts`：Array `append/clear/equal` 分派（append 使用元素类型做 `valueTypeFormat`）
- [x] `runUpdateVar.ts`：所有新字段仅在 `renderType === input` 时生效的 guard
- [x] 写 vitest 测试 `runUpdateVar.test.ts`，运行通过（20 tests）

## Phase 2：前端组件拆分（重构，不改行为）

- [x] 建立目录 `NodeVariableUpdate/`
- [x] 把现有 `NodeVariableUpdate.tsx` 迁到 `NodeVariableUpdate/index.tsx`，拆出 `VariableSelector.tsx`
- [x] 新增 `ValueRenderer.tsx`（按 renderType / valueType 派发）

## Phase 3：前端渲染器（新功能）

- [x] `renderers/NumberFormula.tsx`：运算符下拉 + numberInput（图标化）
- [x] `renderers/BooleanSelect.tsx`：True/False/Negate 下拉
- [x] `renderers/ArrayValue.tsx`：模式下拉 + 按元素类型映射 `InputRender`（不递归）
- [x] `ValueRenderer.tsx`：按 valueType 派发到新 renderer
- [x] 切换模式时清空 `value: undefined`

## Phase 4：i18n

- [x] 补充 `workflow:var_update_boolean_*` 与 `workflow:var_update_array_*` 中 / 英 / 繁中

## Phase 5：联调

- [x] dev server 起：string / number / boolean / array 四类变量逐一验证手动输入 + 引用两种模式
- [x] 老数据打开（无新字段），表现与升级前一致
- [x] 运行 `pnpm lint` 全量通过（0 errors）

## Phase 6：Review 清理（2026-04-15）

- [x] 还原 `constants.ts`：剥离 107 条与 math icons 无关的图标注册，只保留 5 个 `math/*`
- [x] `any[]` 收紧为 `EditorVariablePickerType[]` / `EditorVariableLabelPickerType[]`（3 个 renderer + ValueRenderer）
- [x] 抽出 `getDefaultsForValueType()` 统一目标变量切换时的默认字段下发
- [x] `VariableSelector.tsx`：`.includes('array')` → `.startsWith('array')` 与仓内风格对齐
- [x] `workflow.json` 三语把 `var_update_*` 按字母序移到 `variable_*` 之前
