# 前端能力发现结果 — 人工审阅

> 项目：FastGPT | 规模：large（3307 源文件）| 模式：ultra | 架构：route-hierarchy

请逐个确认以下发现结果。**默认全选（认可），不需要修改的项可直接保持勾选。**

## 确认清单

- [x] 能力树结构正确（包括子能力归属）
- [x] 基础设施/共享模块划分正确
- [x] Monorepo 子应用拆分建议（如有）合理
- [x] 能力中文名称准确
- [x] 已废弃模块清单确认

---

## 判定摘要

| 维度 | 判定结果 | 依据 |
|------|---------|------|
| execution_mode | **ultra** | 源码文件 3307 > 2000 |
| capability_architecture | **route-hierarchy** | Next.js 文件系统路由，pages/ 目录下的嵌套目录形成路由层级。parent_path 非空路由占比约 78%，最大嵌套深度 4 层（如 /dashboard/evaluation/task/detail）。无菜单配置文件。 |
| knowledge_architecture | **single-layer** | 仅 1 个路由器实例（Next.js 内置路由，入口：projects/app/src/pages/_app.tsx） |
| 路由总数 | **49**（43 叶子路由 + 6 分组节点） | 从 43 个路由定义文件提取（pages/ 目录文件系统路由） |

---

## 路由架构

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

---

## 能力树草稿

> **标注说明**：🍃 叶子路由节点，`→` 后为路由路径，`→` 后为组件路径。多入口项目按 `#### 入口：\`xxx\`` 分组展示。

### 业务能力

#### 入口：`projects/app/src/pages/_app.tsx`

- **首页** 🍃 → `/` → `projects/app/src/pages/index.tsx`（备注：）
- **页面未找到** 🍃 → `/404` → `projects/app/src/pages/404.tsx`（备注：）
- **OpenAPI 文档** 🍃 → `/openapi` → `projects/app/src/pages/openapi.tsx`（备注：）
- **对话** → `/chat`（备注：）
  - **分享对话** 🍃 → `/chat/share` → `projects/app/src/pages/chat/share.tsx`（备注：）
- **应用** → `/app`（备注：）
  - **应用详情** 🍃 → `/app/detail` → `projects/app/src/pages/app/detail/index.tsx`（备注：）
- **登录** → `/login`（备注：）
  - **快速登录** 🍃 → `/login/fastlogin` → `projects/app/src/pages/login/fastlogin.tsx`（备注：）
  - **第三方登录** 🍃 → `/login/provider` → `projects/app/src/pages/login/provider.tsx`（备注：）
- **账户** → `/account`（备注：）
  - **API 密钥** 🍃 → `/account/apikey` → `projects/app/src/pages/account/apikey.tsx`（备注：）
  - **通知** 🍃 → `/account/inform` → `projects/app/src/pages/account/inform.tsx`（备注：）
  - **个性化设置** 🍃 → `/account/setting` → `projects/app/src/pages/account/setting.tsx`（备注：）
  - **推广** 🍃 → `/account/promotion` → `projects/app/src/pages/account/promotion.tsx`（备注：）
  - **账单** 🍃 → `/account/bill` → `projects/app/src/pages/account/bill/index.tsx`（备注：）
  - **自定义域名** 🍃 → `/account/customDomain` → `projects/app/src/pages/account/customDomain/index.tsx`（备注：）
  - **账号信息** 🍃 → `/account/info` → `projects/app/src/pages/account/info/index.tsx`（备注：）
  - **模型管理** 🍃 → `/account/model` → `projects/app/src/pages/account/model/index.tsx`（备注：）
  - **团队管理** 🍃 → `/account/team` → `projects/app/src/pages/account/team/index.tsx`（备注：）
  - **第三方集成** 🍃 → `/account/thirdParty` → `projects/app/src/pages/account/thirdParty/index.tsx`（备注：）
  - **用量统计** 🍃 → `/account/usage` → `projects/app/src/pages/account/usage/index.tsx`（备注：）
- **工作台** → `/dashboard`（备注：）
  - **应用工作台** 🍃 → `/dashboard/agent` → `projects/app/src/pages/dashboard/agent/index.tsx`（备注：）
  - **创建应用** 🍃 → `/dashboard/create` → `projects/app/src/pages/dashboard/create/index.tsx`（备注：）
  - **评测** → `/dashboard/evaluation`（备注：）
    - **创建评测** 🍃 → `/dashboard/evaluation/create` → `projects/app/src/pages/dashboard/evaluation/create.tsx`（备注：）
    - **评测数据集** → `/dashboard/evaluation/dataset`（备注：）
      - **文件导入** 🍃 → `/dashboard/evaluation/dataset/fileImport` → `projects/app/src/pages/dashboard/evaluation/dataset/fileImport.tsx`（备注：）
      - **评测数据集详情** 🍃 → `/dashboard/evaluation/dataset/detail` → `projects/app/src/pages/dashboard/evaluation/dataset/detail/index.tsx`（备注：）
    - **评测维度** → `/dashboard/evaluation/dimension`（备注：）
      - **创建维度** 🍃 → `/dashboard/evaluation/dimension/create` → `projects/app/src/pages/dashboard/evaluation/dimension/create.tsx`（备注：）
      - **编辑维度** 🍃 → `/dashboard/evaluation/dimension/edit` → `projects/app/src/pages/dashboard/evaluation/dimension/edit.tsx`（备注：）
    - **评测任务** → `/dashboard/evaluation/task`（备注：）
      - **任务详情** 🍃 → `/dashboard/evaluation/task/detail` → `projects/app/src/pages/dashboard/evaluation/task/detail/index.tsx`（备注：）
  - **MCP 服务器** 🍃 → `/dashboard/mcpServer` → `projects/app/src/pages/dashboard/mcpServer/index.tsx`（备注：）
  - **技能管理** 🍃 → `/dashboard/skill` → `projects/app/src/pages/dashboard/skill/index.tsx`（备注：）
  - **系统工具** 🍃 → `/dashboard/systemTool` → `projects/app/src/pages/dashboard/systemTool/index.tsx`（备注：）
  - **模板市场** 🍃 → `/dashboard/templateMarket` → `projects/app/src/pages/dashboard/templateMarket/index.tsx`（备注：）
  - **工具管理** 🍃 → `/dashboard/tool` → `projects/app/src/pages/dashboard/tool/index.tsx`（备注：）
- **数据集** → `/dataset`（备注：）
  - **数据集列表** 🍃 → `/dataset/list` → `projects/app/src/pages/dataset/list/index.tsx`（备注：）
  - **数据集详情** 🍃 → `/dataset/detail` → `projects/app/src/pages/dataset/detail/index.tsx`（备注：）
- **配置** → `/config`（备注：）
  - **工具配置** → `/config/tool`（备注：）
    - **工具市场** 🍃 → `/config/tool/marketplace` → `projects/app/src/pages/config/tool/marketplace.tsx`（备注：）
- **价格** 🍃 → `/price` → `projects/app/src/pages/price/index.tsx`（备注：）
- **技能** → `/skill`（备注：）
  - **技能详情** 🍃 → `/skill/detail` → `projects/app/src/pages/skill/detail.tsx`（备注：）

---

## 已废弃模块清单

> 如在审阅过程中发现已不再维护的路由或模块，请在此列出。确认后协调者将通过 `router_path` 在 `capability_tree` 中精确定位并移除对应节点，写入 `removed_nodes` 记录。
>
> **填写说明**：`路由路径` 必须与 `route-table.json` 中 `path` 字段完全一致（含前导 `/`）。`节点 label` 填写能力树中对应节点的中文名。`router_path` 和 `节点 label` 必须同时精确匹配 capability_tree 中同一节点，否则回写时暂停并提示修正。

| 序号 | 路由路径（router_path） | 节点 label | 废弃原因 |
|------|------------------------|-----------|---------|
| -- | -- | -- | -- |

---

## 如有修改，请直接输入意见
