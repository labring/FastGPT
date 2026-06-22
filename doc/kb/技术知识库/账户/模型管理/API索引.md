---
capability_label: 模型管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:00:00Z"
parent_module: 账户
roles: [root, owner, admin, member]
router_paths: ["/account/model"]
---

# 模型管理 — API索引

## 系统模型管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/ai/model/list` | POST | 获取全量系统模型列表 | `web/core/ai/config.ts:15` → `ModelConfigTable.tsx:98`<br>`web/core/ai/config.ts:15` → `Log/index.tsx:100`<br>`web/core/ai/config.ts:15` → `ModelDashboard/index.tsx`<br>`web/core/ai/config.ts:15` → `EditChannelModal.tsx` | 账户→模型管理→配置模型Tab→加载时调用；账户→模型管理→渠道日志Tab→加载时调用（获取模型下拉选项）；账户→模型管理→模型监控Tab→加载时调用（获取监控模型列表） |
| `/core/ai/model/detail` | GET | 获取单个模型详细信息 | `web/core/ai/config.ts:19` → `ModelConfigTable.tsx:293` | 账户→模型管理→配置模型Tab→点击编辑模型时调用 |
| `/core/ai/model/update` | PUT | 更新系统模型配置 | `web/core/ai/config.ts:25` → `ModelConfigTable.tsx:261`<br>`web/core/ai/config.ts:25` → `AddModelBox.tsx` | 账户→模型管理→配置模型Tab→确认编辑模型时调用；账户→模型管理→配置模型Tab→确认创建模型时调用 |
| `/core/ai/model/create` | POST | 创建新的系统模型 | `web/core/ai/config.ts:27` → `AddModelBox.tsx` | 账户→模型管理→配置模型Tab→提交新建模型表单时调用 |
| `/core/ai/model/delete` | DELETE | 删除系统模型 | `web/core/ai/config.ts:29` → `ModelConfigTable.tsx:280` | 账户→模型管理→配置模型Tab→确认删除模型时调用 |
| `/core/ai/model/test` | GET | 测试模型连通性 | `web/core/ai/config.ts:35` → `ModelConfigTable.tsx:257` | 账户→模型管理→配置模型Tab→点击测试模型时调用 |
| `/core/ai/model/updateDefault` | PUT | 更新默认模型配置 | `web/core/ai/config.ts:37` → `DefaultModelModal` | 账户→模型管理→活跃模型Tab→root 点击"默认模型"按钮→确认更新时调用 |
| `/core/ai/model/getConfigJson` | GET | 获取模型 JSON 配置 | `web/core/ai/config.ts:31` → `ModelConfigTable.tsx:309` | 账户→模型管理→配置模型Tab→root 点击"JSON 配置"按钮时调用 |
| `/core/ai/model/updateWithJson` | PUT | 通过 JSON 更新模型配置 | `web/core/ai/config.ts:32` → `ModelConfigTable.tsx` | 账户→模型管理→配置模型Tab→root 导入 JSON 配置时调用 |
| `/core/ai/model/getDefaultConfig` | GET | 获取模型默认配置 | `web/core/ai/config.ts:22` → `ModelConfigTable.tsx` | 账户→模型管理→配置模型Tab→创建模型时获取默认配置 |

## 渠道管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channels/all` | GET | 获取渠道列表 | `web/core/ai/channel.ts:110` → `Channel/index.tsx:54` | 账户→模型管理→渠道管理Tab→加载时调用 |
| `/api/aiproxy/api/channels/type_metas` | GET | 获取渠道提供商元数据 | `web/core/ai/channel.ts:124` → `Channel/index.tsx:58` | 账户→模型管理→渠道管理Tab→加载时调用（获取渠道类型信息） |
| `/api/aiproxy/api/createChannel` | POST | 创建新渠道 | `web/core/ai/channel.ts:136` → `EditChannelModal.tsx` | 账户→模型管理→渠道管理Tab→编辑渠道弹窗→确认创建时调用 |
| `/api/aiproxy/api/channel/{id}` | PUT | 更新渠道配置 | `web/core/ai/channel.ts:151` → `Channel/index.tsx:64` | 账户→模型管理→渠道管理Tab→修改优先级失焦时调用；编辑弹窗确认时调用 |
| `/api/aiproxy/api/channel/{id}` | DELETE | 删除渠道 | `web/core/ai/channel.ts:163` → `Channel/index.tsx:82` | 账户→模型管理→渠道管理Tab→确认删除渠道时调用 |
| `/api/aiproxy/api/channel/{id}/status` | POST | 启用/禁用渠道 | `web/core/ai/channel.ts:147` → `Channel/index.tsx:70` | 账户→模型管理→渠道管理Tab→切换渠道启用/禁用时调用 |

## 渠道日志 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/logs/search` | GET | 搜索渠道请求日志 | `web/core/ai/channel.ts:165` → `Log/index.tsx:125` | 账户→模型管理→渠道日志Tab→加载/翻页/筛选时调用 |
| `/api/aiproxy/api/logs/detail/{id}` | GET | 获取日志详情 | `web/core/ai/channel.ts:195` → `Log/index.tsx:280` | 账户→模型管理→渠道日志Tab→点击"详情"按钮时调用 |

## 模型监控 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/dashboardv2/` | GET | 获取模型调用 Dashboard 数据 | `web/core/ai/channel.ts:201` → `ModelDashboard/index.tsx` | 账户→模型管理→模型监控Tab→加载/筛选时调用 |

## API 调用链追踪

### POST `/core/ai/model/list` 调用链

```
ModelConfigTable
  ├── 触发: 组件挂载时自动调用 (manual: false)
  ├── 参数: 空对象 {}
  └── 响应处理: 存储到 systemModelList state，经 useMemo 按类型分组、筛选、排序后渲染表格

ChannelLog
  ├── 触发: 组件挂载时自动调用 (manual: false)
  ├── 参数: 空对象 {}
  └── 响应处理: 构造 modelList 下拉选项（按 provider.order 排序）

ModelDashboard
  ├── 触发: 组件挂载时自动调用
  ├── 参数: 空对象 {}
  └── 响应处理: 用于模型筛选器下拉选项

EditChannelModal
  ├── 触发: 编辑弹窗打开时调用
  ├── 参数: 空对象 {}
  └── 响应处理: 获取可用模型列表供渠道模型配置
```

### PUT `/core/ai/model/update` 调用链

```
ModelConfigTable
  ├── 触发: 点击模型行右侧菜单→编辑→弹窗确认
  ├── 参数: UpdateModelBody (含模型全量配置)
  ├── 错误处理: code=409 且含 references → 弹出引用警告弹窗; code=409 且无 references → toast 错误消息
  └── 响应处理: 成功后调用 refreshModels() 刷新列表 + clientInitData() 刷新全局数据

AddModelBox (ModelEditModal)
  ├── 触发: 新建/编辑模型弹窗→确认提交
  ├── 参数: UpdateModelBody 或 CreateModelBody
  └── 响应处理: 关闭弹窗，刷新父页面模型列表
```

### GET `/api/aiproxy/api/logs/search` 调用链

```
ChannelLog
  ├── 触发: 组件挂载、翻页滚动（useScrollPagination）、筛选条件变更
  ├── 参数: request_id, channel, model_name, code_type, start_timestamp, end_timestamp, p (页数), per_page (每页条数=20)
  ├── 响应处理: 返回 {list, total}，list 经 useMemo 格式化（计算 duration、解析模型名和渠道名）
  └── 分页: 使用 useScrollPagination 实现无限滚动，每页 20 条
```

### GET `/api/aiproxy/api/dashboardv2/` 调用链

```
ModelDashboard
  ├── 触发: 组件挂载、日期范围/模型/渠道筛选变更
  ├── 参数: channel, model, start_timestamp, end_timestamp, timezone, timespan (day/hour/minute)
  └── 响应处理: DashboardDataItemSchema 校验每条 summary，用于渲染 AreaChart 面积图 + DataTableComponent 数据表格
```
