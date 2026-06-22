---
capability_label: 工作台
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T18:00:00.000Z"
parent_module: null
roles: ["管理员", "普通成员", "团队所有者"]
router_paths: ["/dashboard/agent", "/dashboard/create", "/dashboard/evaluation", "/dashboard/mcpServer", "/dashboard/skill", "/dashboard/systemTool", "/dashboard/templateMarket", "/dashboard/tool"]
---

# 工作台 — API索引

> 工作台作为分组节点，其 API 分散在各子能力模块中。本文档汇总工作台公共层及各子能力模块使用的核心 API。

## 应用管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/list` | POST | 获取应用列表 | `web/core/app/api.ts:15` → `pageComponents/dashboard/agent/context.tsx` | 应用工作台→加载应用列表时调用；搜索/筛选时调用 |
| `/core/app/create` | POST | 创建新应用 | `web/core/app/api.ts:34` → `pages/dashboard/create/CreateModal.tsx` | 创建应用→提交创建表单时调用 |
| `/core/app/del` | DELETE | 删除应用/文件夹 | `web/core/app/api.ts:40` → `pageComponents/dashboard/agent/List.tsx` | 应用工作台→删除应用时调用；文件夹删除时调用 |
| `/core/app/update` | PUT | 更新应用信息 | `web/core/app/api.ts:50` → `pageComponents/dashboard/agent/List.tsx` | 应用工作台→编辑应用信息时调用 |
| `/core/app/detail` | GET | 获取应用详情 | `web/core/app/api.ts:45` → 应用详情页 | 应用工作台→点击应用进入详情时调用 |
| `/core/app/copy` | POST | 复制应用 | `web/core/app/api.ts:27` → `pageComponents/dashboard/agent/List.tsx` | 应用工作台→复制应用时调用 |
| `/core/app/transitionWorkflow` | POST | 转换为工作流 | `web/core/app/api.ts:24` → 应用详情页 | 应用详情→切换为工作流模式时调用 |
| `/core/app/getPermission` | GET | 获取应用权限 | `web/core/app/api.ts:53` → 权限管理组件 | 应用/文件夹→管理权限时调用 |
| `/core/app/resumeInheritPermission` | GET | 恢复继承权限 | `web/core/app/api.ts:62` → `pageComponents/dashboard/agent/index.tsx` | 文件夹→恢复继承权限时调用 |
| `/core/app/changeOwner` | POST | 变更应用所有者 | `web/core/app/api.ts:65` → 设置页面 | 团队管理→变更应用所有者时调用 |
| `/core/app/exportSkill` | POST | 导出应用为技能 | `web/core/app/api.ts:75` → 应用详情页 | 应用详情→导出为技能时调用 |

## 文件夹管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/folder/create` | POST | 创建应用文件夹 | `web/core/app/api/app.ts:14` → `pages/dashboard/agent/index.tsx` | 应用工作台→新建文件夹时调用 |
| `/core/app/folder/path` | GET | 获取文件夹路径 | `web/core/app/api/app.ts:17` → `pageComponents/dashboard/agent/context.tsx` | 应用工作台→展示文件夹面包屑时调用 |

## 模板市场 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/template/list` | GET | 获取模板列表 | `web/core/app/api/template.ts:7` → `pageComponents/dashboard/Container.tsx` | 模板市场→加载模板列表时调用 |
| `/core/app/template/detail` | GET | 获取模板详情 | `web/core/app/api/template.ts:10` → 模板详情组件 | 模板市场→查看模板详情时调用 |
| `/proApi/core/app/template/getTemplateTypes` | GET | 获取模板分类标签 | `web/core/app/api/template.ts:13` → `pageComponents/dashboard/Container.tsx` | 模板市场→加载分类标签时调用（Plus版本） |

## 协作管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 协作列表接口 | GET | 获取协作者列表 | `web/core/app/api/collaborator.ts` → `components/common/folder/SlideCard.tsx` | 文件夹→查看协作者列表时调用 |
| 更新协作者接口 | POST | 更新协作者 | `web/core/app/api/collaborator.ts` → `components/common/folder/SlideCard.tsx` | 文件夹→添加/修改协作者时调用 |
| 删除协作者接口 | DELETE | 删除协作者 | `web/core/app/api/collaborator.ts` → `components/common/folder/SlideCard.tsx` | 文件夹→移除协作者时调用 |

## 文件上传 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 预签名上传 URL | GET/POST | 获取头像上传预签名 URL | `web/common/file/api.ts` → `pages/dashboard/agent/index.tsx` | 文件夹→编辑文件夹头像时调用 |

## 说明

工作台各子能力模块（评测、技能管理、工具管理、MCP 服务器等）的 API 定义分散在各自的 API 文件中，完整列表请参见各子能力的 API 索引：

- 应用工作台 API：见 [应用工作台/API索引](../../技术知识库/应用工作台/API索引.md)
- 评测 API：见 [评测/API索引](../../技术知识库/评测/API索引.md)
- 技能管理 API：见 [技能管理/API索引](../../技术知识库/技能管理/API索引.md)
- 工具管理 API：见 [工具管理/API索引](../../技术知识库/工具管理/API索引.md)
- MCP 服务器 API：见 [MCP 服务器/API索引](../../技术知识库/MCP%20服务器/API索引.md)
- 模板市场 API：见 [模板市场/API索引](../../技术知识库/模板市场/API索引.md)
- 系统工具 API：见 [系统工具/API索引](../../技术知识库/系统工具/API索引.md)

### `/core/app/list` 调用链

```
应用工作台页面 (pages/dashboard/agent/index.tsx)
  ├── 触发: 页面加载、搜索关键字变更、应用类型切换
  ├── 参数: { parentId, type, searchKey }
  └── 响应处理: 更新 myApps 列表，驱动列表渲染

DashboardContainer (pageComponents/dashboard/Container.tsx)
  ├── 触发: 模板市场页面加载
  ├── 参数: { type: undefined }
  └── 响应处理: 更新 templateList，过滤隐藏模板
```

### `/core/app/create` 调用链

```
CreateModal (pages/dashboard/create/CreateModal.tsx)
  ├── 触发: 用户选择应用类型并确认创建
  ├── 参数: { name, type, parentId, ... }
  └── 响应处理: 返回新应用 ID，刷新应用列表
```
