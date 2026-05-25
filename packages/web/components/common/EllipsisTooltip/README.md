# EllipsisTooltip

文本溢出时自动显示 Tooltip，未溢出时不展示。

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `label` | `string` | 必填 | 显示文本 |
| `forceShow` | `boolean` | `false` | 强制显示 Tooltip，忽略溢出检测 |
| `tooltipLabel` | `ReactNode` | `label` | Tooltip 内容，不传则同 label |
| `lineClamp` | `number` | `1` | 省略行数，1=单行，>1=多行截断 |
| `tooltipProps` | `Omit<TooltipProps, 'label' \| 'isDisabled' \| 'children'>` | - | 透传给 MyTooltip 的额外属性 |
| `...boxProps` | `BoxProps` | - | 透传给内部 Box 的布局属性（如 `flex`、`minW`、`maxW`、`fontSize` 等） |

## 使用说明

### 布局约束（重要）

组件内部 `Box` 需要被父容器约束宽度才能触发省略。在 flex 容器中使用时，**必须通过 `boxProps` 传入 `flex`、`minW` 等属性**，不能依赖父层隐式约束：

```tsx
// ✅ 正确：通过 boxProps 传入 flex 约束
<EllipsisTooltip label={name} flex="1 1 0" minW={0} />

// ❌ 错误：未传 flex，Box 会撑开父容器，不产生省略
<EllipsisTooltip label={name} />
```

### 溢出检测原理

- **单行**（`lineClamp=1`）：比较 `scrollWidth > clientWidth`，再临时去除 `-webkit-line-clamp` 约束对比高度变化
- **多行**（`lineClamp>1`）：临时移除截断样式，对比自然高度与截断高度（含 1px 浮点容差）

检测在 `useLayoutEffect` 中执行（`label`/`lineClamp` 变化时重新计算），并在 `onMouseEnter` 时兜底复算。

## 示例

```tsx
// 单行省略
<EllipsisTooltip label="这是一段很长的文字" maxW="200px" />

// 多行省略（2 行）
<EllipsisTooltip label="这是一段很长的文字" lineClamp={2} maxW="200px" />

// 在 flex 容器中使用（需传 flex/minW）
<Flex>
  <EllipsisTooltip label={name} flex="1 1 0" minW={0} />
</Flex>

// 自定义 Tooltip 内容
<EllipsisTooltip label="简短标签" tooltipLabel={<Box>详细说明</Box>} maxW="100px" />

// 强制显示 Tooltip（不检测溢出）
<EllipsisTooltip label="文字" forceShow maxW="200px" />
```
