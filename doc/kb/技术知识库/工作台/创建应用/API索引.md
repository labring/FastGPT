---
capability_label: 创建应用
doc_type: "13"
doc_label: "组件列表"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 工作台
roles: [团队管理员, 团队成员]
router_paths: [/dashboard/create]
---

# 创建应用 — 组件列表

> 本文档列出创建应用页面的核心组件及其 Props。

## 1. AppTypeCard

应用类型选择卡片，展示图标、标题和简介，选中时蓝色边框高亮。

- **组件位置**: `projects/app/src/pageComponents/app/create/AppTypeCard.tsx`
- **来源**: 本模块专属组件

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `selectedAppType` | `CreateAppType` | 是 | 当前选中的应用类型 |
| `onClick` | `() => void` | 是 | 点击卡片回调 |
| `option` | `(typeof createAppTypeMap)[keyof typeof createAppTypeMap]` | 是 | 卡片数据（含 `type`、`icon`、`title`、`intro`） |

- **内部组件**: `Card`（Chakra UI）、`MyIcon`
- **选中态**: `borderColor: 'primary.300'`（蓝色边框）
- **未选中态**: `borderColor: 'myGray.200'`

## 2. HeaderAuthForm

Header 鉴权配置表单，支持 None/Bearer/Basic/Custom 四种鉴权类型。

- **组件位置**: `projects/app/src/components/common/secret/HeaderAuthForm.tsx`
- **来源**: 共享组件（`@/components/common/secret/`）

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `headerSecretValue` | `HeaderSecretConfigType` | 是 | 当前鉴权配置值 |
| `onChange` | `(secret: HeaderSecretConfigType) => void` | 是 | 鉴权配置变更回调 |
| `fontWeight` | `string` | 否 | 标题字重（默认 `'medium'`） |
| `bg` | `string` | 否 | 输入框背景色（默认 `'myGray.50'`） |

- **鉴权类型**: `HeaderSecretTypeEnum.None` / `Bearer` / `Basic` / `Custom`
- **Custom 模式**: 支持多组 Key/Value 键值对，可动态添加/删除
- **secret 显示**: 已有 secret 值时显示"已配置"标识（蓝色文字 + 对勾图标），点击编辑图标重新输入

## 3. AIModelSelector

AI 模型选择器，支持单行下拉和多行分组选择两种模式。

- **组件位置**: `projects/app/src/components/Select/AIModelSelector.tsx`
- **来源**: 共享组件（`@/components/Select/`）

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 当前选中模型 ID |
| `onChange` | `(value: string) => void` | 否 | 选中变更回调 |
| `list` | `{ label: string; value: string }[]` | 是 | 可选模型列表 |
| `isMultipleRow` | `boolean` | 否 | 是否多行分组模式（默认单行 `OneRowSelector`） |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 | 尺寸 |
| `disableTip` | `string` | 否 | 禁用提示 |

- **内部组件**: `MySelect`（单行）、`MultipleRowSelect`（多行）、`Avatar`、`MyTooltip`
- **数据源**: 从 `useSystemStore` 读取全部模型列表（LLM/Embedding/TTS/STT/ReRank）
- **模型筛选**: 仅显示用户已配置的模型（通过 `getMyModelList` 过滤）

## 4. Avatar

头像展示组件，用于应用头像预览和上传入口。

- **组件位置**: `@fastgpt/web/components/common/Avatar`
- **来源**: 共享组件库

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `src` | `string` | 否 | 头像图片 URL |
| `borderRadius` | `string` | 否 | 圆角 |
| `cursor` | `string` | 否 | 鼠标样式（上传场景用 `'pointer'`） |
| `onClick` | `() => void` | 否 | 点击回调（触发头像上传） |
| `w` | `string \| number` | 否 | 宽度 |
| `fallbackSrc` | `string` | 否 | 加载失败兜底图 |

## 5. MyTooltip

提示框包裹组件，鼠标悬停显示提示文本。

- **组件位置**: `@fastgpt/web/components/common/MyTooltip`
- **来源**: 共享组件库

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 | 提示文本 |
| `children` | `React.ReactNode` | 是 | 包裹的子元素 |

## 6. MyIcon

图标组件，按名称渲染 SVG 图标。

- **组件位置**: `@fastgpt/web/components/common/Icon`
- **来源**: 共享组件库

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 图标名称（如 `'common/backLight'`、`'core/chat/chevronRight'`、`'common/info'`） |
| `w` | `string \| number` | 否 | 宽度 |
| `h` | `string \| number` | 否 | 高度 |
| `color` | `string` | 否 | 颜色 |

## 7. LeftRadio

左对齐单选组件，选项垂直排列，每项含标题和描述。

- **组件位置**: `@fastgpt/web/components/common/Radio/LeftRadio`
- **来源**: 共享组件库

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `list` | `{ title: string; value: string; desc?: string }[]` | 是 | 选项列表 |
| `value` | `string` | 否 | 当前选中值 |
| `onChange` | `(e: string) => void` | 否 | 选中变更回调 |
| `defaultBg` | `string` | 否 | 默认背景色 |
| `activeBg` | `string` | 否 | 选中背景色 |

## 8. MyBox

通用容器组件，支持 loading 状态。

- **组件位置**: `@fastgpt/web/components/common/MyBox`
- **来源**: 共享组件库

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `isLoading` | `boolean` | 否 | 是否显示加载状态 |
| `children` | `React.ReactNode` | 是 | 子元素 |

## 9. MyImage

图片展示组件，用于显示应用类型预览图。

- **组件位置**: `@fastgpt/web/components/common/Image/MyImage`
- **来源**: 共享组件库

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `src` | `string` | 是 | 图片 URL |
| `w` | `string \| number` | 否 | 宽度 |

## 10. 页面级组件

### CreateAppsPage

创建应用主页面组件。

- **组件位置**: `projects/app/src/pages/dashboard/create/index.tsx`
- **类型**: React 函数式组件（`'use client'`）
- **导出**: `export default CreateAppsPage`
- **服务端渲染**: 导出 `getServerSideProps`，加载 `app` 和 `user` 命名空间的 i18n 词条

**内部状态**:
- `selectedAppType` — 当前选中的应用类型（默认 `AppTypeEnum.chatAgent`）
- `creatingTemplateId` — 正在创建中的模板 ID
- `copilotModel` — 智能生成选用的模型 ID（默认 `defaultModels.llm?.id`）

**路由参数**（query）:
- `parentId` — 父级目录/工具目录 ID
- `appType` — 预选的应用类型

**条件渲染逻辑**:
- `selectedAppType === AppTypeEnum.workflow` → 显示智能生成区域
- `selectedAppType === AppTypeEnum.mcpToolSet` → 显示 MCP 鉴权 + URL + 工具列表区域
- `selectedAppType === AppTypeEnum.httpToolSet` → 显示 HTTP 工具创建模式选择区域
- `isPc === true` → 显示右侧预览图区域
- `templateData?.list?.length > 0` → 显示模板列表区域
