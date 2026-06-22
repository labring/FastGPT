---
capability_label: 模型监控
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:30:00Z"
parent_module: 模型管理
roles: [root]
router_paths: ["/account/model"]
---

# 模型监控 — API索引

## 监控数据查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/dashboardv2/` | GET | 获取 Dashboard V2 监控数据（按时间序列返回各模型的调用统计） | `web/core/ai/channel.ts:201` → `pageComponents/account/model/ModelDashboard/index.tsx:214` | 模型管理→模型监控→加载时调用；模型管理→模型监控→更改时间范围/渠道/模型筛选时调用 |

## 筛选器选项

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/aiproxy/api/channels/all` | GET | 获取可用渠道列表（用于渠道筛选下拉框） | `web/core/ai/channel.ts:110` → `pageComponents/account/model/ModelDashboard/index.tsx:89` | 模型管理→模型监控→加载时调用（并行请求） |
| `/core/ai/model/list` | POST | 获取系统模型列表（用于模型筛选下拉框 + 模型价格计算） | `web/core/ai/config.ts:15` → `pageComponents/account/model/ModelDashboard/index.tsx:111` | 模型管理→模型监控→加载时调用（并行请求） |

---

## API 调用链追踪

### `/api/aiproxy/api/dashboardv2/` 调用链

```
ModelDashboard/index.tsx (useRequest)
  ├── 触发: root用户进入模型监控Tab时自动触发；更改筛选条件（时间范围/渠道/模型/时间粒度）时自动触发
  ├── 请求参数:
  │     channel?: number      — 渠道ID筛选
  │     model?: string        — 模型名筛选
  │     start_timestamp?: number — 起始时间戳（秒）
  │     end_timestamp?: number   — 结束时间戳（秒）
  │     timezone: string      — 浏览器时区
  │     timespan: 'day'|'hour'|'minute' — 数据聚合粒度
  ├── 响应结构:
  │     [{timestamp: number, summary: DashboardDataItemType[]}]
  │     DashboardDataItemType含: model, channel_id, request_count, exception_count,
  │       input_tokens, output_tokens, total_tokens, total_time_milliseconds,
  │       total_ttfb_milliseconds, max_rpm, max_tpm, cache_hit_count
  ├── 响应处理:
  │     1. 对每个summary项用 DashboardDataItemSchema.parse 校验
  │     2. 前端按timespan补全缺失的时间段（填充空白数据）
  │     3. 聚合summary数组计算总请求数、错误率、Token总量、AI积分花费
  │     4. 区分LLM模型用于缓存命中率计算
  │     5. 生成chartData数组供AreaChartComponent消费
  │     6. DataTableComponent消费dashboardData原始数据做表格聚合
  ├── 刷新依赖: [filterProps.channelId, filterProps.dateRange, filterProps.model, filterProps.timespan]
  └── 错误处理: 由useRequest统一管理loading/error状态
```

### `/api/aiproxy/api/channels/all` 调用链

```
ModelDashboard/index.tsx (useRequest)
  ├── 触发: root用户进入模型监控Tab时自动触发（仅首次加载）
  ├── 请求参数: {page: 1, perPage: 10}
  ├── 响应处理:
  │     1. 后端返回后按status排序（活跃优先），再按priority降序
  │     2. 前端map为 {label: item.name, value: item.id} 格式
  │     3. 前置 "全部" 选项（value为空字符串）
  └── 消费: MySelect组件的list prop，用于渠道筛选下拉框
```

### `/core/ai/model/list` 调用链

```
ModelDashboard/index.tsx (useRequest)
  ├── 触发: root用户进入模型监控Tab时自动触发（仅首次加载）
  ├── 请求参数: {}（空对象）
  ├── 响应处理:
  │     1. 按模型提供商order排序
  │     2. 前端map为 {order, icon, label: item.model, value: item.model} 格式
  │     3. 前置 "全部" 选项
  │     4. 同时构建 modelPriceMap（Map<model名, 价格信息>）供AI积分计算
  │     5. 构建 llmModelSet（Set<model名>）用于LLM模型识别
  └── 消费:
       - MySelect组件的list prop（模型筛选下拉框）
       - modelPriceMap → calculateModelPrice（图表+表格中的积分计算）
       - llmModelSet → isLLMModel（缓存命中率展示判断）
```
