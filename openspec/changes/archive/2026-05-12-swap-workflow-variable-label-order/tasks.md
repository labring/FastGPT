## 1. 修正

- [x] 1.1 回退 `Reference.tsx` 的错误修改（`git checkout`）

## 2. 核心实现

- [x] 2.1 在 `NodeExtract/index.tsx` L213 将 `label: \`${t('common:extraction_results')}-${data.key}\`` 改为 `label: \`${data.key} - ${t('common:extraction_results')}\``

## 3. 验证

- [x] 3.1 在工作流中添加文本内容提取节点，新增提取字段（如 `dwa`），确认输出标签展示为 `dwa - 提取结果`
- [x] 3.2 在下游节点（如判断器）中引用该字段，确认引用选择器中显示 `dwa - 提取结果`
- [x] 3.3 编辑已有字段并保存，确认标签更新为新格式
