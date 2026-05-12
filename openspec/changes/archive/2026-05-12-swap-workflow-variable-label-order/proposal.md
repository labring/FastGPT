## Why

工作流变量引用选择器中，已选变量展示为 `{节点输出标签} → {字段名}` 格式（如 "提取结果 → 字段名"）。当字段名较长时，关键信息（字段名本身）被挤到右侧，用户难以快速辨认所选字段。将字段名提前可提升可读性和选择效率。

## What Changes

- 调换变量引用选择器已选值的展示顺序：`{字段名} → {节点输出标签}` 替代 `{节点输出标签} → {字段名}`
- 同时调整多选（数组引用）模式下的展示顺序保持一致
- 下拉级联选择的列顺序保持不变（仍为节点 → 输出），仅调整选中后的展示标签

## Capabilities

### New Capabilities

- `workflow-variable-label-display`: 工作流变量引用选择器已选变量的标签展示格式

### Modified Capabilities

<!-- 无现有 spec 被修改 -->

## Impact

- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference.tsx` — `SingleReferenceSelector` 和 `MultipleReferenceSelector` 组件中的 display label 顺序
