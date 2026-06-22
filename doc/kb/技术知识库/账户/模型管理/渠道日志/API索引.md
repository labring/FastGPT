---
capability_label: 渠道日志
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 模型管理
roles: [root]
router_paths: [/account/model]
---

# 渠道日志 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channels/all` | GET | 获取全部渠道列表（用于筛选下拉） | `src/web/core/ai/channel.ts:110` → `src/pageComponents/account/model/Log/index.tsx:81` | 模型管理→渠道日志→页面加载时调用（填充渠道筛选下拉） |
| `/api/aiproxy/api/logs/search` | GET | 分页搜索渠道请求日志 | `src/web/core/ai/channel.ts:165` → `src/pageComponents/account/model/Log/index.tsx:125` | 模型管理→渠道日志→首次加载时调用；修改筛选条件时调用；滚动到底部加载更多时调用 |
| `/core/ai/model/list` | POST | 获取系统模型列表（用于筛选下拉） | `src/web/core/ai/config.ts:15` → `src/pageComponents/account/model/Log/index.tsx:100` | 模型管理→渠道日志→页面加载时调用（填充模型筛选下拉） |

## 详情

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/logs/detail/{id}` | GET | 获取单条日志详情（请求体/响应体） | `src/web/core/ai/channel.ts:195` → `src/pageComponents/account/model/Log/index.tsx:284` | 模型管理→渠道日志→失败请求→点击详情按钮时调用（成功请求直接使用列表数据） |

## API 调用链追踪

### `GET /api/aiproxy/api/channels/all` 调用链

```
渠道日志页面 (Log/index.tsx:81)
  ├── 触发: 渠道日志 Tab 激活，页面初始化
  ├── Hook: useRequest(getChannelList, {manual: false})
  ├── 参数: page=1, perPage=10
  ├── 响应处理: 按 status 升序、priority 降序排序 → 转换为 {label: name, value: String(id)} → 前置 「全部」选项 → 存入 channelList 状态
  └── 错误处理: 默认空数组，筛选下拉为空
```

### `POST /core/ai/model/list` 调用链

```
渠道日志页面 (Log/index.tsx:100)
  ├── 触发: 渠道日志 Tab 激活，页面初始化
  ├── Hook: useRequest(getSystemModelList, {manual: false})
  ├── 参数: 无
  ├── 响应处理: 映射为 {order, icon, label: model, value: model} → 按 order 排序 → 前置 「全部」选项 → 存入 modelList
  └── 错误处理: 默认空数组，筛选下拉为空
```

### `GET /api/aiproxy/api/logs/search` 调用链

```
渠道日志页面 (Log/index.tsx:125)
  ├── 触发: 页面初始化 / 筛选条件变化 / 滚动到底部
  ├── Hook: useScrollPagination(getChannelLog, {pageSize: 20, refreshDeps: [filterProps]})
  ├── 参数:
  │   ├── request_id: filterProps.request_id (仅 root)
  │   ├── channel: filterProps.channelId (渠道ID，空字符串=全部)
  │   ├── model_name: filterProps.model (模型名，空字符串=全部)
  │   ├── code_type: filterProps.code_type ('all'|'success'|'error')
  │   ├── start_timestamp: filterProps.dateRange.from.getTime()
  │   ├── end_timestamp: filterProps.dateRange.to.getTime()
  │   ├── result_only: true
  │   ├── p: Math.floor(offset / pageSize) + 1
  │   └── per_page: pageSize (20)
  ├── 响应处理: 返回 {list: logs[], total} → 格式化为 LogDetailType（计算 duration、匹配渠道名/模型名、格式化时间） → 渲染表格
  └── 错误处理: 由 useScrollPagination 统一处理，显示加载失败状态
```

### `GET /api/aiproxy/api/logs/detail/{id}` 调用链

```
日志详情弹窗 (Log/index.tsx:284)
  ├── 触发: 点击失败请求的「详情」按钮
  ├── Hook: useRequest(getLogDetail, {manual: false})
  ├── 参数: id (日志记录ID)
  ├── 条件: 仅当 data.code !== 200 时发起请求
  ├── 响应处理: 合并 detailData 与列表数据（{...res, ...data}） → 渲染详情网格
  └── 错误处理: catch 后回退使用列表数据（return data），确保基本信息始终可展示
```
