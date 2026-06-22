---
capability_label: 工具配置
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T12:00:00.000Z
parent_module: 配置
roles: [admin]
router_paths: [/config/tool, /config/tool/marketplace]
---

# 工具配置 — API索引

本模块为分组索引节点。API 按子归属分为「工具配置首页 API」和「工具市场 API」两部分。

## 工具配置首页 API

API 定义位置：`projects/app/src/web/core/plugin/admin/tool/api.ts`

### 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/admin/system/tool/list` | GET | 获取系统工具列表 | `src/web/core/plugin/admin/tool/api.ts` → `src/pages/config/tool/index.tsx` | 工具配置→工具配置首页→页面加载时调用 |
| `/admin/system/tool/detail` | GET | 获取单个工具详情 | `src/web/core/plugin/admin/tool/api.ts` → `src/pageComponents/config/tool/SystemToolConfigModal.tsx` | 工具配置→工具配置首页→打开工具配置弹窗时调用 |

### 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/admin/system/tool/update` | PUT | 更新工具配置（状态、默认安装、标签、密钥价格等） | `src/web/core/plugin/admin/tool/api.ts` → `src/pageComponents/config/tool/SystemToolConfigModal.tsx` | 工具配置→工具配置首页→提交工具配置表单时调用 |
| `/admin/system/tool/order` | PUT | 更新工具排序 | `src/web/core/plugin/admin/tool/api.ts` → `src/pages/config/tool/index.tsx` | 工具配置→工具配置首页→拖拽排序完成后调用 |

### 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/admin/system/tool/delete` | DELETE | 卸载系统工具 | `src/web/core/plugin/admin/api.ts` → `src/pageComponents/config/tool/SystemToolConfigModal.tsx` | 工具配置→工具配置首页→确认删除工具时调用 |

### 标签管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/admin/system/tool/tags` | GET | 获取工具标签列表 | `src/web/core/plugin/admin/tool/api.ts` → `src/pageComponents/config/tool/SystemToolConfigModal.tsx` 等 | 工具配置→工具配置首页→加载标签选项时调用 |

## 工具市场 API

API 定义位置：`projects/app/src/web/core/plugin/marketplace/api.ts`

### 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/marketplace/tool/list` | GET | 获取市场工具列表（分页+搜索+标签筛选） | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→页面加载/搜索/翻页/筛选时调用 |
| `/marketplace/tool/detail` | GET | 获取市场工具详情 | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→点击工具卡片查看详情时调用 |
| `/marketplace/tool/tags` | GET | 获取市场标签列表 | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→页面加载时调用 |
| `/marketplace/tool/versions` | GET | 获取市场所有工具版本信息 | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→计算可更新工具列表时调用 |
| `/marketplace/tool/download/url` | GET | 获取单个工具下载地址 | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→安装/更新单个工具时调用 |
| `/marketplace/tool/download/urls` | POST | 批量获取工具下载地址 | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→批量更新工具时调用 |

### 已安装插件

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/admin/system/installedPlugins` | GET | 获取已安装系统插件列表 | `src/web/core/plugin/marketplace/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→页面加载/安装/卸载/更新后刷新时调用 |

### 安装/卸载

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/admin/plugin/install` | POST | 通过 URL 安装插件 | `src/web/core/plugin/admin/api.ts` → `src/pages/config/tool/marketplace.tsx` | 工具配置→工具市场→安装/更新工具时调用 |

## 详细 API 调用链请参见子能力文档

- **工具配置首页**：详见 [12-API索引](../工具配置首页/API索引.md)
- **工具市场**：详见 [12-API索引](../工具市场/API索引.md)
