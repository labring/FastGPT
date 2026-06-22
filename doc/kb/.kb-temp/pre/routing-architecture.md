# 路由架构摘要

## 项目路由架构

本项目使用 **Next.js Pages Router（文件系统路由）**，路由由 `pages/` 目录下的文件结构自动生成，无需显式路由配置文件。

### 路由器实例
项目中存在 **1 个** Next.js 内置路由器实例，通过 `pages/_app.tsx` 统一管理。使用 `next/router` 的 `useRouter` hook 进行客户端导航。

### 路由定义位置
所有前端页面路由通过 `projects/app/src/pages/` 目录下的文件结构定义。API 路由位于 `projects/app/src/pages/api/` 目录下，不纳入前端路由表。

### 路由注册方式
Next.js 文件系统路由自动注册：
- `pages/index.tsx` → `/`
- `pages/xxx.tsx` → `/xxx`
- `pages/xxx/index.tsx` → `/xxx`
- `pages/xxx/yyy.tsx` → `/xxx/yyy`

### 路由守卫/中间件
- `/` 路由重定向至 `/dashboard/agent`（需要登录）
- 部分路由无需 Layout（`/openapi`）
- 登录成功后根据 `lastRoute` 参数重定向

### 嵌套关系
通过目录层级形成嵌套，深度最大 4 层（如 `/dashboard/evaluation/task/detail`）。中间目录（无 `index.tsx` 的目录）作为分组节点，`component` 为 `null`。

### Route Name
项目不使用命名路由，导航通过路径字符串进行（`router.push('/dashboard/agent')` 等）。

router_entry_files: ["projects/app/src/pages/_app.tsx"]
