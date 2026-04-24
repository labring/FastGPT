# EllipsisTooltip

文本溢出时自动显示 Tooltip，未溢出时不展示。

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `label` | `string` | 必填 | 显示文本 |
| `tooltipLabel` | `ReactNode` | `label` | Tooltip 内容（不传则同 label） |
| `lineClamp` | `number` | `1` | 省略行数，>1 时启用多行截断 |
| `tooltipProps` | `TooltipProps` | - | 透传给 MyTooltip 的额外属性 |
| `...boxProps` | `BoxProps` | - | 透传给 Box 的属性（如 maxW、fontSize 等） |

## 示例

```tsx
// 单行省略
<EllipsisTooltip label="这是一段很长的文字" maxW="200px" />

// 多行省略（2行）
<EllipsisTooltip label="这是一段很长的文字" lineClamp={2} maxW="200px" />

// 自定义 Tooltip 内容
<EllipsisTooltip label="简短标签" tooltipLabel={<Box>详细说明</Box>} maxW="100px" />
```
