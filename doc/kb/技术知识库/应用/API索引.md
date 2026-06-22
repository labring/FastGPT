---
capability_label: 应用
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: null
roles: [admin, collaborator, viewer]
router_paths: [/app/detail]
---

# 应用 — API索引

## 应用 CRUD 操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/list` | POST | 获取应用列表（不分页/分页） | `web/core/app/api.ts:15` → `pageComponents/dashboard/agent/List.tsx` | 工作台→应用工作台→加载时调用；工作台→工具管理→加载时调用 |
| `/core/app/detail` | GET | 获取应用详情 | `web/core/app/api.ts:45` → `pageComponents/app/detail/context.tsx:172` | 应用→应用详情→页面加载时调用 |
| `/core/app/create` | POST | 创建新应用 | `web/core/app/api.ts:34` → `pages/dashboard/create/index.tsx` | 工作台→创建应用→提交创建表单时调用 |
| `/core/app/update` | PUT | 更新应用配置 | `web/core/app/api.ts:50` → `pageComponents/app/detail/context.tsx:197` | 应用→应用详情→修改配置后保存时调用 |
| `/core/app/del` | DELETE | 删除应用 | `web/core/app/api.ts:40` → `pageComponents/app/detail/context.tsx:269` | 应用→应用详情→确认删除操作时调用 |

## 版本管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/version/publish` | POST | 发布应用版本 | `web/core/app/api/version.ts:15` → `pageComponents/app/detail/context.tsx:241` | 应用→应用详情→编辑完成后点击发布时调用 |
| `/core/app/version/latest` | GET | 获取最新版本信息 | `web/core/app/api/version.ts:12` → `pageComponents/app/detail/context.tsx:189` | 应用→应用详情→有写权限时加载最新版本信息 |
| `/core/app/version/list` | POST | 获取版本历史列表 | `web/core/app/api/version.ts:18` | 应用→应用详情→查看版本历史 |
| `/core/app/version/detail` | GET | 获取指定版本详情 | `web/core/app/api/version.ts:21` | 应用→应用详情→查看历史版本内容 |
| `/core/app/version/update` | POST | 更新版本信息 | `web/core/app/api/version.ts:24` | 应用→应用详情→修改版本备注等 |

## 权限与协作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/getPermission` | GET | 获取应用权限信息 | `web/core/app/api.ts:53` | 应用详情加载时查询权限 |
| `/core/app/resumeInheritPermission` | GET | 恢复继承权限 | `web/core/app/api.ts:62` | 权限异常时恢复操作 |
| `/proApi/core/app/changeOwner` | POST | 转让应用所有权 | `web/core/app/api.ts:65` | 应用→应用详情→转让所有者 |

## 应用查询与导出

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/getBasicInfo` | POST | 批量获取应用基本信息 | `web/core/app/api.ts:59` | 跨模块引用时批量查询应用名称/头像 |
| `/core/app/appsByToolId` | GET | 查询引用某工具的应用列表 | `web/core/app/api.ts:67` | 工具详情→查看引用该工具的应用 |
| `/core/app/exportSkill` | POST | 导出应用为技能文件 | `web/core/app/api.ts:75` | 工作台→技能管理→从应用导出技能 |
| `/proApi/core/chat/team/getApps` | POST | 按标签获取团队应用 | `web/core/app/api.ts:36` | 对话首页→团队应用列表加载 |

> 各 API 的完整调用链追踪（含参数说明、响应处理、错误处理）见 [应用详情 — API索引](../应用详情/API索引.md)。
