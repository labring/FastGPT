---
capability_label: 渠道管理
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:03:42Z"
parent_module: 模型管理
roles:
  - root
router_paths:
  - /account/model
---

# 渠道管理 — API索引

API 定义文件: `projects/app/src/web/core/ai/channel.ts`

所有 API 请求基于 `/api/aiproxy/api` 前缀，通过 axios 实例发送，自动处理空值过滤和响应校验。

## 渠道查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channels/all` | GET | 获取全部渠道列表 | `channel.ts:110` → `Channel/index.tsx:54` | 渠道管理→渠道列表→加载时调用；渠道管理→创建/编辑/删除/启停/优先级→操作成功后刷新列表 |

## 供应商元数据

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channels/type_metas` | GET | 获取供应商类型元数据（名称、默认URL、密钥说明） | `channel.ts:124` → `Channel/index.tsx:58`；`channel.ts:124` → `EditChannelModal.tsx:70` | 渠道管理→渠道列表→加载时调用；渠道管理→创建/编辑渠道→加载供应商下拉选项 |

## 渠道创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/createChannel` | POST | 创建新渠道 | `channel.ts:136` → `EditChannelModal.tsx:127` | 渠道管理→创建渠道→提交创建表单时调用 |

## 渠道更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channel/{id}` | PUT | 更新渠道完整信息 | `channel.ts:151` → `EditChannelModal.tsx:127`；`channel.ts:151` → `Channel/index.tsx:64` | 渠道管理→编辑渠道→提交编辑表单时调用；渠道管理→调整优先级→输入框失焦时调用 |
| `/api/aiproxy/api/channel/{id}/status` | POST | 切换渠道状态（启用/禁用） | `channel.ts:147` → `Channel/index.tsx:70` | 渠道管理→渠道列表→操作菜单→启用/禁用时调用 |

## 渠道删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channel/{id}` | DELETE | 删除渠道 | `channel.ts:163` → `Channel/index.tsx:82` | 渠道管理→渠道列表→操作菜单→删除→确认后调用 |

## API 调用链追踪

### `/api/aiproxy/api/channels/all` 调用链

```
ChannelTable (Channel/index.tsx)
  ├── 触发: 组件挂载时自动调用（useRequest manual:false）
  ├── 参数: page=1, perPage=10
  └── 响应处理: 按 status 排序（启用在前），同 status 按 priority 降序；更新 channelList 状态

ChannelTable (Channel/index.tsx) — 操作成功后
  ├── 触发: 创建/编辑/删除/启停/优先级修改成功后手动调用 refreshChannelList
  ├── 参数: 同上
  └── 响应处理: 同上，刷新表格显示
```

### `/api/aiproxy/api/channels/type_metas` 调用链

```
ChannelTable (Channel/index.tsx)
  ├── 触发: 组件挂载时自动调用
  ├── 参数: 无
  └── 响应处理: 将返回值与 aiproxyChannels 合并为 channelProviders，用于展示供应商名称和图标

EditChannelModal (EditChannelModal.tsx)
  ├── 触发: 弹窗打开时自动调用
  ├── 参数: 无
  └── 响应处理: 将 Object.entries 映射为下拉选项（含图标、标签、默认URL、密钥说明），用于供应商类型选择
```

### `/api/aiproxy/api/createChannel` 调用链

```
EditChannelModal (EditChannelModal.tsx)
  ├── 触发: 用户点击"新建"按钮（非编辑模式、表单校验通过）
  ├── 参数: {type, name, base_url, models, model_mapping, key, priority: 1}
  └── 响应处理: 成功后关闭弹窗、调用 onSuccess（刷新列表）、Toast 提示"创建成功"
```

### `/api/aiproxy/api/channel/{id}` (PUT) 调用链

```
EditChannelModal (EditChannelModal.tsx)
  ├── 触发: 用户点击"更新"按钮（编辑模式、表单校验通过）
  ├── 参数: {type, name, base_url, models, model_mapping, key, status, priority}
  └── 响应处理: 成功后关闭弹窗、调用 onSuccess（刷新列表）、Toast 提示"更新成功"

ChannelTable (Channel/index.tsx)
  ├── 触发: 优先级输入框失焦时（onBlur）
  ├── 参数: 完整渠道数据 + 新 priority 值（空值默认 1）
  └── 响应处理: 成功后自动刷新列表
```

### `/api/aiproxy/api/channel/{id}/status` 调用链

```
ChannelTable (Channel/index.tsx)
  ├── 触发: 用户点击操作菜单中的"启用"或"禁用"
  ├── 参数: {status: ChannelStatusEnabled | ChannelStatusDisabled}
  └── 响应处理: 成功后自动刷新列表
```

### `/api/aiproxy/api/channel/{id}` (DELETE) 调用链

```
ChannelTable (Channel/index.tsx)
  ├── 触发: 用户点击操作菜单"删除"→确认弹窗中点击确认
  ├── 参数: id（渠道ID）
  └── 响应处理: 成功后自动刷新列表
```

## API 基础配置

所有 API 请求共享以下配置：

- **Base URL**: `/api/aiproxy/api`（通过 `getWebReqUrl` 拼接）
- **超时**: 60000ms
- **请求头**: `content-type: application/json`
- **数据过滤**: 请求前自动清除值为 `undefined` 的字段
- **响应校验**: `response.data.success` 为 true 时返回 `response.data.data`；否则 reject
- **错误处理**: 网络错误/超时统一 reject，显示控制台日志
