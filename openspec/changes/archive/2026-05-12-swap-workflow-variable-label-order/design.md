## Context

文本内容提取节点（`NodeExtract`）动态创建输出字段时，在 `NodeExtract/index.tsx` L213 中拼接 label：
```
label: `${t('common:extraction_results')}-${data.key}`
```
结果如 `提取结果-dwa`，在后续节点（如判断器）的变量引用选择器中展示为此格式。

用户更关心字段名（如 `dwa`）而非前缀（如 `提取结果`），字段名前置可提升辨识效率，长字段名时尤为明显。

## Goals / Non-Goals

**Goals:**
- 调换动态提取字段的输出 label 格式：`{字段名} - {提取结果}` 替代 `{提取结果}-{字段名}`
- 仅影响文本内容提取节点新增的字段

**Non-Goals:**
- 不改变已有的存量字段 label（需用户重新保存字段才会更新）
- 不改变变量引用选择器的级联结构
- 不改变其他节点的输出 label 格式

## Decisions

### 决策：修改 NodeExtract 输出 label 拼装顺序

`NodeExtract/index.tsx` L213 是唯一的修改点：
```typescript
// Before
label: `${t('common:extraction_results')}-${data.key}`,
// After
label: `${data.key} - ${t('common:extraction_results')}`,
```

同时将分隔符从 `-` 改为 ` - `（空格包围），与用户期望的 `字段名 - 提取结果` 格式一致。

## Risks / Trade-offs

- **存量字段不更新**：已创建字段的 label 不会变化，只有编辑后重新保存才会生效
  - 缓解：这是纯展示优化，不影响功能；用户可批量编辑字段来刷新 label
- **仅影响 NodeExtract**：项目中无其他节点使用相同 label 拼接模式

## Migration Plan

- 纯前端展示变更，无需数据迁移
- 存量字段 label 保持不变（已序列化在 workflow 数据中）
- 回滚：恢复 L213 的字符串模板顺序即可
