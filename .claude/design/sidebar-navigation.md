# 侧边导航栏设计文档

> 最后更新：2026-04-15

## 概述

FastGPT 使用统一的侧边导航栏组件 `DashboardNavbar`，适用于 Dashboard 页面和应用详情页（二级页面）。导航栏支持展开 / 折叠两种状态，仅在 PC 端渲染。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `projects/app/src/pageComponents/dashboard/Container.tsx` | 导航栏核心组件，含所有子组件定义和导航数据 |
| `projects/app/src/pages/app/detail/index.tsx` | 应用详情页，复用 `DashboardNavbar`，初始折叠 |

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
    └── 折叠切换按钮
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
const [isCollapsed, setIsCollapsed] = useState(true); // 默认折叠
const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

{isPc && <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}
<Box pl={isPc ? sidebarWidth : 0} ...>
  <AppDetail />
</Box>
```

---

## 路由激活判断

| 导航项 | 激活条件 |
|--------|----------|
| 门户 | `pathname.startsWith('/chat')` |
| 模板市场 | `pathname.startsWith('/dashboard/templateMarket')` |
| 应用构建（折叠态） | `pathname` 匹配 appBuildItems 任意 path 或 `/app/detail` |
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
