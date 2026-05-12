# 侧边导航栏设计文档

> 最后更新：2026-05-12

## 概述

FastGPT 使用统一的侧边导航栏组件 `DashboardNavbar`，适用于 Dashboard 页面和应用详情页（二级页面）。导航栏支持展开 / 折叠两种状态，仅在 PC 端渲染。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `projects/app/src/pageComponents/dashboard/Container.tsx` | 导航栏核心组件，含所有子组件定义、`DashboardContainer` 和导航数据 |
| `projects/app/src/pages/app/detail/index.tsx` | 应用详情页，直接使用 `DashboardNavbar`，固定折叠 |
| `projects/app/src/pages/skill/detail.tsx` | Skill 详情页，直接使用 `DashboardNavbar`，固定折叠 |
| `projects/app/src/pages/dataset/list/index.tsx` | 知识库列表页，直接使用 `DashboardNavbar`，默认展开 |
| `projects/app/src/pages/dataset/detail/index.tsx` | 知识库详情页，直接使用 `DashboardNavbar`，固定折叠 |
| `projects/app/src/pageComponents/account/AccountContainer.tsx` | 账户设置容器，直接使用 `DashboardNavbar`，默认展开 |
| `projects/app/src/pages/config/tool/index.tsx` | 系统工具配置页，直接使用 `DashboardNavbar`，默认展开 |
| `projects/app/src/pages/config/tool/marketplace.tsx` | 工具市场配置页，直接使用 `DashboardNavbar`，默认展开 |

---

## 页面引用树

```
DashboardNavbar（定义于 pageComponents/dashboard/Container.tsx）
│
├── [间接] 通过 DashboardContainer 包装（默认展开，可折叠）
│   ├── pages/dashboard/agent/index.tsx              — 应用列表
│   ├── pages/dashboard/tool/index.tsx               — 工具列表
│   ├── pages/dashboard/systemTool/index.tsx         — 系统工具
│   ├── pages/dashboard/mcpServer/index.tsx          — MCP 服务
│   ├── pages/dashboard/templateMarket/index.tsx     — 模板市场
│   └── pages/dashboard/evaluation/                  — 应用测评
│       ├── index.tsx
│       ├── dimension/edit.tsx
│       ├── dimension/create.tsx
│       └── dataset/fileImport.tsx
│
├── [直接] 一级页面（默认展开，可折叠）
│   ├── pages/dataset/list/index.tsx                 — 知识库列表
│   ├── pageComponents/account/AccountContainer.tsx  — 账户设置
│   ├── pages/config/tool/index.tsx                  — 系统工具配置
│   └── pages/config/tool/marketplace.tsx            — 工具市场配置
│
└── [直接] 二级页面（固定折叠 + hideCollapseButton，不可展开）
    ├── pages/app/detail/index.tsx                   — 应用详情
    ├── pages/skill/detail.tsx                       — Skill 详情
    └── pages/dataset/detail/index.tsx               — 知识库详情
```

---

## 尺寸常量

```ts
// Container.tsx
export const SIDEBAR_EXPANDED_WIDTH = '224px';  // 展开宽度
export const SIDEBAR_COLLAPSED_WIDTH = '72px';  // 折叠宽度
```

---

## 组件结构

```
DashboardNavbar
├── 顶部 Logo 区域
├── 导航菜单区域（VStack）
│   ├── NavItem          —— 叶子节点（门户、模板市场、知识库、应用测评）
│   ├── SubNavGroup      —— 可展开分组（应用构建）
│   │   └── NavItem(indent) —— 二级子项
│   └── SubNavSettings   —— 可展开设置分组（设置）
│       └── SettingsItem    —— 二级子项（含退出登录）
└── 底部区域
    ├── TeamPlanStatusCard（仅展开时显示）
    └── 折叠切换按钮（hideCollapseButton=true 时隐藏）
```

---

## 子组件说明

### NavItem

叶子导航节点，同时支持一级和二级（indent）两种形态。

**Props**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `icon` | `string` | — | 图标名，indent 子项传空字符串 |
| `label` | `string` | — | 展开时显示的文本 |
| `collapsedLabel` | `string?` | — | 折叠时显示的文本（可选，默认用 label） |
| `isActive` | `boolean` | — | 当前是否选中 |
| `isCollapsed` | `boolean` | — | 侧边栏是否折叠 |
| `onClick` | `() => void` | — | 点击回调 |
| `indent` | `boolean` | `false` | 是否为二级缩进子项 |

**布局规则**

| 状态 | 高度 | 内边距 | 内容排列 |
|------|------|--------|----------|
| 折叠（主项） | auto | py=7px, px=12px | 列方向（icon 上，文字下） |
| 展开（主项） | 40px | px=20px | 行方向 |
| 二级子项（展开） | 36px | px=44px | 行方向，无 icon |
| 二级子项（折叠中） | 36px | px=20px | 行方向，无 icon |

---

### SubNavGroup

可展开的导航分组，用于**应用构建**。折叠时点击直接跳转子项第一个路由；展开时点击切换子列表显隐。

**Props**

| 属性 | 类型 | 说明 |
|------|------|------|
| `items` | `{ key, label, path }[]` | 子项列表 |
| `isExpanded` | `boolean` | 子列表是否展开 |
| `onToggle` | `() => void` | 展开/折叠切换 |
| `onItemClick` | `(path: string) => void` | 子项点击回调 |
| `currentPath` | `string` | 当前路由 pathname |

**当前子项（appBuildItems）**

```ts
[
  { key: 'agent', label: '应用',     path: '/dashboard/agent' },
  { key: 'tool',  label: '工具',     path: '/dashboard/tool' },
  { key: 'mcp',   label: 'MCP 服务', path: '/dashboard/mcpServer' }
]
// ⚠️ Skill 已隐藏，不在列表中
```

---

### SubNavSettings

可展开的设置分组，子项支持 `isLogout` 标记退出登录。折叠时点击跳转第一个有 path 的子项；展开状态下点击子项执行路由跳转或登出。

**SettingsItem 类型**

```ts
type SettingsItem = {
  key: string;
  label: string;
  path?: string;      // 普通路由跳转
  isLogout?: boolean; // 退出登录
};
```

---

## 样式规范

### 颜色

| 用途 | 激活色 | 默认色 |
|------|--------|--------|
| 图标 | `#156AD9` | `#505F73` |
| 一级文本 | `#156AD9` | `#2D3540` |
| 二级文本（SubNavGroup） | `#156AD9` | `#3E4A59` |
| 二级文本（SubNavSettings） | `#156AD9` | `#3E4A59` |
| 背景（激活/悬停） | `rgba(50, 136, 250, 0.1)` | `transparent` |

### 字重（fontWeight）

| 场景 | 选中 | 未选中 |
|------|------|--------|
| 一级导航文本 | `600` | `500` |
| 二级导航文本 | `600` | `500` |

> 规则：`isActive ? 600 : 500`，一/二级均适用。

### 字号（fontSize）

| 场景 | 值 |
|------|-----|
| 一级导航（展开） | `14px` |
| 一级导航（折叠） | `12px` |
| 二级导航子项 | `13px` |

---

## 折叠/展开逻辑

```
isCollapsed = true   → 宽度 72px，仅显示 icon + 短文字（列方向）
isCollapsed = false  → 宽度 224px，显示完整导航列表
```

- **展开状态**默认值：Dashboard 页面默认 `false`（展开），应用详情页默认 `true`（折叠）
- **切换方式**：点击底部 `navbar/bottomIcon` 按钮
- **动画**：`transition: width 0.2s ease` / `padding-left 0.2s ease`
- **分组展开状态（expandedKeys）初始化规则**：
  - 使用模块级变量 `savedExpandedKeys` 在 SPA 会话内跨页面导航记忆展开状态
  - **首次加载**（`savedExpandedKeys === null`）：
    - `app-build` 分组：仅当当前路由匹配 `/dashboard/agent`、`/dashboard/skill`、`/dashboard/tool`、`/dashboard/systemTool`、`/dashboard/mcpServer` 其中之一时默认展开
    - `settings` 分组：当当前路由以 `/account` 或 `/config` 开头时默认展开
    - 其他路由均不默认展开任何分组
  - **页面间导航**：直接复用 `savedExpandedKeys` 记忆值，已展开的分组保持展开不自动收起
  - **用户手动切换**：`toggleExpand` 同步更新 `savedExpandedKeys`，确保偏好被记住

---

## 页面使用方式

### Dashboard 页面

```tsx
// DashboardContainer（Container.tsx）
const [isCollapsed, setIsCollapsed] = useState(false); // 默认展开

{isPc && <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}
<Box pl={isPc ? sidebarWidth : 0} ...>
  {children}
</Box>
```

### 应用详情页（二级页面）

```tsx
// Provider（pages/app/detail/index.tsx）
const [isCollapsed] = useState(true); // 固定折叠，不可切换
const sidebarWidth = SIDEBAR_COLLAPSED_WIDTH;

{isPc && <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={() => {}} hideCollapseButton />}
<Box pl={isPc ? sidebarWidth : 0} ...>
  <AppDetail />
</Box>
```

> 二级页面传入 `hideCollapseButton` 隐藏底部折叠按钮，侧边栏固定为折叠态。

---

## 路由激活判断

| 导航项 | 激活条件 |
|--------|----------|
| 门户 | `pathname.startsWith('/chat')` |
| 模板市场 | `pathname.startsWith('/dashboard/templateMarket')` |
| 应用构建（折叠态） | `pathname` 匹配 appBuildItems 任意 path、`/app/detail` 或 `/skill/detail` |
| 知识库 | `pathname.startsWith('/dataset')` |
| 应用测评 | `pathname.startsWith('/dashboard/evaluation')` |
| 设置（折叠态） | `settingsItems` 中任意 item.path 与 pathname 匹配 |

---

## 权限控制

| 导航项 | 权限条件 |
|--------|----------|
| 应用测评 | `userInfo?.team?.permission.hasEvaluationCreatePer` |
| 设置 > 团队 / 用量 / 通知 | `feConfigs?.isPlus` |
| 设置 > 账单 | `feConfigs?.show_pay && permission.hasManagePer` |
| 设置 > API Key | `permission.hasApikeyCreatePer` |
| 设置 > 推广 | `feConfigs?.show_promotion && permission.isOwner` |
| 设置 > 系统配置（root） | `userInfo?.username === 'root'` |
