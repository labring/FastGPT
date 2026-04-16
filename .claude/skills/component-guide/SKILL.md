---
name: component-guide
description: FastGPT 前端组件使用指南。出码时优先复用项目已有组件，避免重复造轮子。每次出码前检查组件快照是否过期（运行脚本更新），然后参考本指南选择合适的组件。用户上传了图片（UI 设计稿、截图、原型图等）时，必须优先激活此 Skill，分析图片中的 UI 元素并映射到项目已有组件后再出码。
snapshot_hash: "29d5478011bba9a09fc07ef99b84c1f2"
snapshot_updated_at: "2026-03-23 12:42:59"
---

# FastGPT 前端组件使用指南

> 出码时必须优先使用已有组件，禁止重复实现相同功能。

## 配套文件

| 文件 | 说明 | 维护方式 |
|------|------|----------|
| [component-api.md](./component-api.md) | 核心组件 API 速查 + 代码规范 | 手动维护 |
| [component-snapshot.md](./component-snapshot.md) | 全量组件扫描快照 | 脚本自动生成 |
| [gen-component-guide.mjs](./gen-component-guide.mjs) | 快照生成脚本 | — |

## 何时使用此技能

- **用户上传了图片**（UI 设计稿、截图、原型图、线框图等）时，**必须优先激活此 Skill**
- 编写任何前端页面或组件时
- 需要弹窗、下拉、菜单、表格、输入框等通用 UI 时
- 审查前端代码，检查是否存在重复造轮子的情况时

## 图片触发流程

当用户上传图片时：
1. 分析图片中出现的 UI 元素（弹窗、按钮、输入框、列表等）
2. 对照本指南的组件优先级表，将 UI 元素映射到项目已有组件
3. 确认无可复用组件后，再考虑自行实现

## 快照检查流程

```bash
# 每次出码前，先运行以下命令检查组件库是否有更新
node .claude/skills/common/skills/component-guide/gen-component-guide.mjs

# 输出 "组件库无变化" → 直接参考 component-api.md 出码
# 输出 "检测到变更"   → 等更新完成，再查阅 component-snapshot.md 确认新组件
```

## 组件优先级规则

### 🔴 必须优先使用（禁止重复实现）

| 场景 | 组件 | 导入路径 |
|------|------|----------|
| 弹窗/对话框 | `MyModal` | `@fastgpt/web/components/common/MyModal` |
| 下拉选择 | `MySelect` | `@fastgpt/web/components/common/MySelect` |
| 右键/操作菜单 | `MyMenu` | `@fastgpt/web/components/common/MyMenu` |
| 气泡提示 | `MyTooltip` | `@fastgpt/web/components/common/MyTooltip` |
| 气泡卡片 | `MyPopover` | `@fastgpt/web/components/common/MyPopover` |
| 加载状态 | `MyLoading` | `@fastgpt/web/components/common/MyLoading` |
| 空状态提示 | `EmptyTip` | `@fastgpt/web/components/common/EmptyTip` |
| 带加载态容器 | `MyBox` | `@fastgpt/web/components/common/MyBox` |
| 图标 | `MyIcon` | `@fastgpt/web/components/common/Icon` |
| 头像 | `Avatar` | `@fastgpt/web/components/common/Avatar` |
| 分割线 | `MyDivider` | `@fastgpt/web/components/common/MyDivider` |
| 标签 | `MyTag` | `@fastgpt/web/components/common/Tag` |
| 搜索输入框 | `SearchInput` | `@fastgpt/web/components/common/Input/SearchInput` |
| 数字输入框 | `MyNumberInput` | `@fastgpt/web/components/common/Input/NumberInput` |
| 日期选择 | `DateTimePicker` | `@fastgpt/web/components/common/DateTimePicker` |
| 日期范围选择 | `DateRangePicker` | `@fastgpt/web/components/common/DateRangePicker` |
| Markdown 渲染 | `Markdown` | `@fastgpt/web/components/common/Markdown` |
| 拖拽排序 | `DndDrag` | `@fastgpt/web/components/common/DndDrag` |
| 折叠提示 | `LightTip` | `@fastgpt/web/components/common/LightTip` |

### 🟡 业务组件（优先使用）

| 场景 | 组件 | 路径 |
|------|------|------|
| 文件选择 | `FileSelect` | `@/components/core/app/FileSelect` |
| 数据集选择 | `DatasetSelect` | `@/components/core/app/DatasetSelect` |
| 变量编辑 | `VariableEdit` | `@/components/core/app/VariableEdit` |
| AI 模型设置 | `AISettingModal` | `@/components/core/ai/AISettingModal` |
| 提示词编辑器 | `PromptEditor` | `@fastgpt/web/components/common/Textarea/PromptEditor` |
| 代码编辑器 | `CodeEditor` | `@fastgpt/web/components/common/Textarea/CodeEditor` |
| JSON 编辑器 | `JSONEditor` | `@fastgpt/web/components/common/Textarea/JsonEditor` |
| 目录移动 | `MoveModal` | `@/components/common/folder/MoveModal` |
| 路径面包屑 | `FolderPath` | `@/components/common/folder/Path` |

---

> 详细 API 示例见 [component-api.md](./component-api.md)
> 完整组件清单见 [component-snapshot.md](./component-snapshot.md)
