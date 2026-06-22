---
capability_label: 账号信息
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles: ["普通成员", "团队管理员", "团队拥有者"]
router_paths: ["/account/info"]
---

# 账号信息 — Store 数据流

## 说明

本模块无独立 Store（未检测到本模块专属的状态管理模块定义）。

模块的状态管理通过以下方式实现：
- **`useUserStore`**（`@/web/support/user/useUserStore`）：提供 `userInfo`、`initUserInfo()`、`updateUserInfo()` 等用户状态管理。页面加载时通过 `initUserInfo()` 获取用户信息；头像上传后通过 `updateUserInfo()` 更新。
- **`useSystemStore`**（`@/web/common/system/useSystemStore`）：提供 `feConfigs` 系统功能开关、`subPlans` 子套餐配置。控制 Plus 功能、优惠券入口、客服入口等条件渲染。
- **Props 传递**：`onOpenContact` 回调通过 Props 从主页面传递到 MyInfo、Other 等子组件。
- **局部状态**：各子组件通过 `useState`/`useDisclosure` 管理弹窗开关、表单字段等局部状态。

## Store 概览（本模块消费）

| Store 文件 | Store ID | 用途 | 本模块使用方式 |
|-----------|---------|------|-------------|
| `web/support/user/useUserStore.ts` | `useUserStore` | 用户信息、团队权限、套餐状态 | `initUserInfo()` 加载；`updateUserInfo()` 更新头像；`userInfo` 渲染个人信息 |
| `web/common/system/useSystemStore.ts` | `useSystemStore` | 系统功能开关、套餐配置 | `feConfigs` 控制功能可见性；`subPlans` 提供套餐名和URL |

## 数据流向

### 页面初始化流程

```
Info组件 (useMount)          useUserStore.initUserInfo          API
    │                              │                              │
    │ initUserInfo()               │                              │
    ├─────────────────────────────►│                              │
    │                              │ GET /api/support/            │
    │                              │     user/tokenLogin          │
    │                              ├─────────────────────────────►│
    │                              │ ◄─── userInfo JSON ──────────┤
    │                              │                              │
    │                              │ initTeamPlanStatus()         │
    │                              ├─────────────────────────────►│
    │                              │ ◄─── teamPlanStatus ─────────┤
    │                              │                              │
    │ ◄── state 更新 ─────────────┤                              │
    │                              │                              │
    │ UI 渲染 userInfo + plan      │                              │
```

### 头像更新流程（乐观更新）

```
MyInfo组件                  useUserStore.updateUserInfo       API
    │                              │                            │
    │ 上传成功后调用              │                            │
    │ updateUserInfo({avatar})    │                            │
    ├─────────────────────────────►│                            │
    │                              │ 乐观更新 state (立即)     │
    │ ◄── 头像UI立即更新 ─────────┤                            │
    │                              │ PUT /api/.../update       │
    │                              ├───────────────────────────►│
    │                              │ ◄─── 成功 ────────────────┤
    │                              │                            │
    │                              │ （失败 → 回滚旧值）        │
```

## 组件间通信模式

| 通信模式 | 场景 | 涉及组件 |
|---------|------|---------|
| Store 共享状态 | 用户信息、系统配置的全局共享 | `Info` → `useUserStore` / `useSystemStore` |
| Props 传递回调 | 子组件触发联系客服 | `Info` → `MyInfo(onOpenContact)` / `Other(onOpenContact)` → `CommunityModal` |
| Props 传递回调 | 弹窗关闭回调 | `Info` → 各 Modal (onClose) |
| 路由参数 | 页面级路由 `/account/info` | Next.js 路由 → `Info` |
| 局部 useState | 弹窗开关状态 | `useDisclosure()` 在各子组件内 |
