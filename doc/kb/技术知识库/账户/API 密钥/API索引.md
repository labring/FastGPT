---
capability_label: API 密钥
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles: ["团队管理员", "团队成员"]
router_paths: ["/account/apikey"]
---

# API 密钥 — API索引

> API 定义文件：`projects/app/src/web/support/openapi/api.ts`

## 查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/openapi/list` | GET | 获取 API 密钥列表 | `src/web/support/openapi/api.ts:20` → `src/components/support/apikey/Table.tsx:82` | 账户→API 密钥页→加载时调用；账户→API 密钥页→创建/编辑/删除后刷新时调用 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/openapi/create` | POST | 创建新的 API 密钥 | `src/web/support/openapi/api.ts:8` → `src/components/support/apikey/Table.tsx:353` | 账户→API 密钥页→EditKeyModal→提交创建表单时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/openapi/update` | PUT | 更新已有 API 密钥 | `src/web/support/openapi/api.ts:14` → `src/components/support/apikey/Table.tsx:363` | 账户→API 密钥页→EditKeyModal→提交编辑表单时调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/support/openapi/delete` | DELETE | 删除指定 API 密钥 | `src/web/support/openapi/api.ts:26` → `src/components/support/apikey/Table.tsx:72` | 账户→API 密钥页→确认删除弹窗→确认时调用 |

## 外部依赖 API

> 以下 API 由其他模块定义，本模块在调用示例功能中间接使用。

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/app/get` | GET | 获取应用详情（用于生成调用示例） | `src/web/core/app/api.ts:getAppDetailById` → `src/components/support/apikey/Table.tsx:93` | 账户→API 密钥页→点击「调用示例」→获取应用变量和配置信息时调用（仅 appId 存在时） |

## API 调用链追踪

### `/support/openapi/list` 调用链

```
ApiKeyTable (src/components/support/apikey/Table.tsx)
  ├── 触发: 页面加载时自动调用（manual: false），或创建/编辑/删除成功后手动刷新
  ├── 参数: { appId } — 可选，当传入 appId 时过滤特定应用的密钥
  └── 响应处理: 更新 apiKeys 状态，驱动表格渲染；loading 状态控制 MyBox 遮罩
```

### `/support/openapi/create` 调用链

```
EditKeyModal (src/components/support/apikey/Table.tsx)
  ├── 触发: 用户点击「新建」按钮→弹出 EditKeyModal→填写表单→点击确认
  ├── 参数: { name, limit: { maxUsagePoints, expiredTime }, appId } — name 必填，maxUsagePoints 默认 -1（无限制）
  └── 响应处理: 成功回调 onCreate，传入新密钥 ID → 显示密钥展示弹窗 → 刷新列表
```

### `/support/openapi/update` 调用链

```
EditKeyModal (src/components/support/apikey/Table.tsx)
  ├── 触发: 用户点击行操作菜单「编辑」→弹出 EditKeyModal（带已有数据）→修改表单→点击确认
  ├── 参数: { _id, name, limit: { maxUsagePoints, expiredTime }, appId } — _id 用于定位要更新的密钥
  └── 响应处理: 成功回调 onEdit → 关闭弹窗 → 刷新列表
```

### `/support/openapi/delete` 调用链

```
ApiKeyTable (src/components/support/apikey/Table.tsx)
  ├── 触发: 用户点击行操作菜单「删除」→弹出确认弹窗→用户确认
  ├── 参数: { id } — 要删除的密钥 ID
  └── 响应处理: 成功回调 onSuccess → 刷新列表；确认弹窗带 type: 'delete' 使用红色警告样式
```
