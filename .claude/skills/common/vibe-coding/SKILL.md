---
name: vibe-coding
description: Analyzes UI design images or Figma links and generates React/TypeScript code by intelligently matching project components, then public components, then third-party libraries. Activates when user mentions "vibe coding", "UI 设计图", "组件复用", "design to code", "根据设计图生成代码", or provides a design file/screenshot to implement.
---

# Vibe Coding — 前端组件智能识别与复用

> 根据 UI 设计图，按优先级（项目复合组件 → 公共组件 → 第三方库）生成符合项目规范的 React 代码。

## 目录

- [使用场景](#使用场景)
- [执行流程](#执行流程)
- [详细步骤](#详细步骤)
- [输出规范](#输出规范)
- [示例](#示例)

---

## 使用场景

- 用户提供 UI 设计图（截图、Figma 链接、Sketch 文件）并要求生成代码
- 用户提到 "vibe coding"、"根据设计图写代码"、"UI 转代码"
- 用户需要实现一个新页面或组件，并提供了视觉参考
- 用户希望复用项目现有组件来还原设计稿

---

## 执行流程

```
输入设计图
    ↓
步骤 1：复合组件匹配
    ↓ 不匹配
步骤 2：原子组件拆解
    ↓
步骤 3：公共组件匹配（使用 /component-guide skill）
    ↓ 未覆盖部分
步骤 4：第三方库兜底（@chakra-ui/react）
    ↓
步骤 5：生成 React TypeScript 代码
```

**短路规则**：步骤 1 匹配成功则跳过步骤 2-5，直接输出配置方案。

---

## 详细步骤

### 步骤 1：复合组件匹配

**目标**：判断设计图是否可通过项目现有「可配置复合组件」直接实现。

**操作**：
- 对比设计图与项目「可配置复合组件清单」，识别 UI 结构、功能是否匹配
- 若匹配，判断能否通过 props、插槽、主题配置还原设计效果

**判断结果**：
- ✅ 匹配 → 输出组件名 + 配置项 JSON，**任务结束**
- ❌ 不匹配 → 进入步骤 2

---

### 步骤 2：原子组件拆解

**目标**：将设计图拆解为最小粒度的基础 UI 元素。

**识别范围**：

| 类别 | 常见组件 |
|------|---------|
| 交互类 | Button、Select、Input、Checkbox、Radio、Switch |
| 布局类 | Card、Modal、Drawer、Tabs、Table |
| 展示类 | Tag、Badge、Progress、Icon、Avatar |

**输出格式**：`[Button, Select, Table, Modal, ...]`

---

### 步骤 3：公共组件匹配

**目标**：为每个原子组件优先匹配项目内的公共组件。

**操作**：
1. 调用 `/component-guide` skill 获取项目公共组件快照
2. 遍历原子组件清单，搜索功能和 UI 匹配的公共组件
3. 匹配标准：样式（颜色、尺寸）+ 交互（点击反馈、表单验证）均需满足

**输出格式**：
```
Button → 使用项目公共组件 MyButton
Select → 无匹配公共组件（进入步骤 4）
```

---

### 步骤 4：第三方组件库兜底

**目标**：为无公共组件匹配的原子组件选择第三方库组件。

**当前项目指定库**：`@chakra-ui/react@2.10.7`

**操作**：选择与设计图功能、UI 最接近的 Chakra UI 组件，并标注适配建议。

**输出格式**：`Select → 使用 @chakra-ui/react 的 Select，适配建议：覆盖边框色 borderColor: 'primary.500'`

---

### 步骤 5：代码生成

**目标**：基于识别结果生成符合项目规范的 React 代码。

**代码规范**：
- 使用 TypeScript，组件 props 需有完整类型定义
- 样式使用 Chakra UI 的 `sx` prop 或内置 props，**避免内联 style**
- 遵循项目现有的组件命名与文件组织规范
- 复用的公共组件保持原有接口，**不得修改其内部实现**
- 使用 `type` 而非 `interface` 进行类型声明（项目规范）

---

## 输出规范

最终输出包含以下三个部分：

```markdown
## UI 组件使用方案

### 复合组件（如适用）
- 使用项目复合组件 `ProForm`，配置项：`{ layout: 'horizontal', fields: [...] }`

### 原子组件清单
| 组件 | 来源 | 说明 |
|------|------|------|
| Button | 项目公共组件 `MyButton` | — |
| Select | Chakra UI `Select` | 覆盖边框色：`borderColor: 'primary.500'` |
| Table  | 项目公共组件 `SortTable` | — |

### 生成代码
// ... React TSX 代码
```

---

## 示例

### Example 1：完整匹配复合组件

**用户输入**：提供一张数据列表页设计图，包含搜索栏、表格、分页

**执行过程**：
1. 步骤 1：识别为数据表格布局，匹配到项目 `DataTable` 复合组件
2. 判断可通过 `columns`、`pagination` props 配置还原设计

**输出**：
```
使用项目复合组件 DataTable，配置项：
{
  "columns": [...],
  "pagination": { "pageSize": 10 },
  "searchable": true
}
```
任务结束。

---

### Example 2：原子组件拆解 + 混合来源

**用户输入**：提供一张表单弹窗设计图，含标题、输入框、下拉选择、提交按钮

**执行过程**：
1. 步骤 1：无匹配复合组件
2. 步骤 2：拆解为 `[Modal, Input, Select, Button]`
3. 步骤 3：`Modal` → 项目公共组件 `MyModal`；`Input` → 项目公共组件 `MyInput`；`Button` → 项目公共组件 `MyButton`；`Select` → 无匹配
4. 步骤 4：`Select` → `@chakra-ui/react` 的 `Select`
5. 步骤 5：生成代码

**输出**：

```tsx
import MyModal from '@/components/common/MyModal';
import MyInput from '@/components/common/MyInput';
import MyButton from '@/components/common/MyButton';
import { Select } from '@chakra-ui/react';

type FormData = {
  name: string;
  category: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
};

export const CreateItemModal = ({ isOpen, onClose, onSubmit }: Props) => {
  // ... 实现
};
```

---

## Do / Don't

**Do**：
- ✅ 优先使用项目公共组件，保持 UI 一致性
- ✅ 调用 `/component-guide` 获取最新组件快照
- ✅ 输出组件来源表格，方便审查
- ✅ 使用 TypeScript type 定义 props

**Don't**：
- ❌ 跳过公共组件直接使用第三方库
- ❌ 修改公共组件的内部实现来适配设计
- ❌ 使用内联 `style`，应使用 Chakra UI sx prop
- ❌ 使用 `interface` 替代 `type`（不符合项目规范）
