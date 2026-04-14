# TODO — 变量更新节点类型操作扩展

> 设计见同目录 `design.md`

## Phase 1：类型 & 运行时（后端，先行）

- [ ] 扩展 `TUpdateListItem` 类型，新增 `numberOperator / booleanMode / arrayMode`
- [ ] `runUpdateVar.ts`：添加 oldValue 读取工具函数
- [ ] `runUpdateVar.ts`：Number 公式分派（含除零保持旧值）
- [ ] `runUpdateVar.ts`：Boolean `true/false/negate` 分派
- [ ] `runUpdateVar.ts`：Array `append/clear/manual` 分派（append 使用元素类型做 `valueTypeFormat`）
- [ ] `runUpdateVar.ts`：所有新字段仅在 `renderType === input` 时生效的 guard
- [ ] 写 vitest 测试 `runUpdateVar.test.ts`，运行通过

## Phase 2：前端组件拆分（重构，不改行为）

- [ ] 建立目录 `NodeVariableUpdate/`
- [ ] 把现有 `NodeVariableUpdate.tsx` 迁到 `NodeVariableUpdate/index.tsx`，拆出 `VariableSelector.tsx`
- [ ] 新增 `ValueRenderer.tsx`（派发占位，先直连现有 InputRender/Reference 分支）
- [ ] 确认重构后行为与重构前一致（手工跑 dev server 验证 string 场景）

## Phase 3：前端渲染器（新功能）

- [ ] `renderers/NumberFormula.tsx`：运算符下拉 + numberInput
- [ ] `renderers/BooleanSelect.tsx`：True/False/Negate 下拉
- [ ] `renderers/ArrayValue.tsx`：模式下拉 + 递归 ValueRenderer（通过 props 注入避免循环 import）
- [ ] `ValueRenderer.tsx`：按 valueType 派发到新 renderer
- [ ] 切换模式时清空 `value: undefined`

## Phase 4：i18n

- [ ] 补充 `workflow:var_update.boolean_mode.*` 与 `workflow:var_update.array_mode.*` 中英日三语

## Phase 5：联调

- [ ] dev server 起：string / number / boolean / array 四类变量逐一验证手动输入 + 引用两种模式
- [ ] 老数据打开（无新字段），表现与升级前一致
- [ ] 运行 `pnpm lint` 全量通过
- [ ] 运行 `pnpm test` 全量通过
