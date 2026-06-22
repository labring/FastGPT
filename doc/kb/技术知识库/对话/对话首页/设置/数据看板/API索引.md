---
capability_label: "数据看板"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T12:00:00Z"
parent_module: "设置"
roles: ["管理员"]
router_paths: ["/chat?pane=s&tab=d"]
---

# 数据看板 — API索引

## 本模块直接调用的 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/app/logs/getChartData` | POST | 获取图表统计数据（user/chat/app 三维度） | `web/core/app/api/log.ts:42` → `pageComponents/app/detail/Logs/LogChart.tsx:150` | 数据看板→LogChart 挂载时；筛选条件（日期/渠道/时间粒度/偏移量）变化时自动重新请求 |
| `/core/app/logs/getLogKeys` | GET | 获取日志显示字段配置 | `web/core/app/api/log.ts:33` → `pageComponents/app/detail/Logs/context.tsx:79` | LogsContextProvider 挂载时自动调用（manual:false）；appId 变化时重新调用 |
| `/proApi/core/app/logs/getTotalData` | GET | 获取汇总统计数据 | `web/core/app/api/log.ts:39` → `pageComponents/app/detail/Logs/TotalData.tsx` | LogChart 内的 TotalData 组件挂载时调用 |

## API 类型定义

| 类型名称 | 定义位置 | 用途 |
|---------|---------|------|
| `getChartDataBody` | `packages/global/openapi/core/app/log/api.ts` | `getAppChartData` 请求参数类型 |
| `getChartDataResponse` | `packages/global/openapi/core/app/log/api.ts` | `getAppChartData` 响应类型，含 userData/chatData/appData |
| `getLogKeysQuery` | `packages/global/openapi/core/app/log/api.ts` | `getLogKeys` 请求参数类型 |
| `getLogKeysResponseType` | `packages/global/openapi/core/app/log/api.ts` | `getLogKeys` 响应类型 |
| `getTotalDataQuery` | `packages/global/openapi/core/app/log/api.ts` | `getAppTotalData` 请求参数类型 |
| `getTotalDataResponse` | `packages/global/openapi/core/app/log/api.ts` | `getAppTotalData` 响应类型 |

## API 调用链追踪

### `POST /proApi/core/app/logs/getChartData` 调用链

```
DataDashboard.tsx
  └── 渲染 <LogChart appId={appId} />

LogChart.tsx (4 callers: Dashboard, DataDashboard, LogChart自身)
  ├── 触发: 组件挂载时自动请求（manual: !feConfigs?.isPlus）
  ├── refreshDeps: [appId, dateRange.from, dateRange.to, offset, chatSources,
  │                 userTimespan, chatTimespan, appTimespan]
  ├── 参数:
  │   ├── appId: 从 ChatPageContext.chatSettings.appId 获取（回退 AppContext）
  │   ├── dateStart: LogsContext.dateRange.from || new Date()
  │   ├── dateEnd: addDays(LogsContext.dateRange.to, 1)
  │   ├── offset: 本地 state（默认 offsetOptions[0].value = '0'）
  │   ├── source: LogsContext.chatSources
  │   ├── userTimespan: 本地 state（默认 'day'）
  │   ├── chatTimespan: 本地 state（默认 'day'）
  │   └── appTimespan: 本地 state（默认 'day'）
  └── 响应处理:
      ├── formatChartData (useMemo): 时间序列补全 + 缺失日期填充 + 衍生指标计算
      │   ├── generateCompleteTimeSeries(): 根据 timespan 生成完整日期轴
      │   ├── processChartData(): 数据映射 + 补全
      │   └── calculateStats(): 计算 cumulative 汇总值
      └── 渲染 3 个 Accordion 面板中的 11 张图表
```

### `GET /core/app/logs/getLogKeys` 调用链

```
DataDashboard.tsx
  └── 渲染 <LogsContextProvider appId={appId}>

LogsContext/context.tsx (6 callers)
  ├── 触发: 组件挂载时自动请求（manual: false）
  ├── refreshDeps: [appId]
  ├── 参数: { appId }
  └── 响应处理:
      ├── onSuccess: 本地无缓存 → setLogKeysStorage(res.logKeys)
      ├── 本地有缓存 → 保留本地缓存，不从接口覆盖
      └── showSyncPopover: 团队配置与本地配置不一致时显示同步提示
```

## 数据请求策略

| 维度 | 策略 |
|------|------|
| **触发模式** | 声明式（useRequest + refreshDeps），非命令式 |
| **请求去重** | useRequest 内置去重，refreshDeps 变化时自动请求 |
| **商业版控制** | `manual: !feConfigs?.isPlus`：非商业版不发起请求，使用 fakeChartData |
| **缓存策略** | logKeys 使用 localStorage 缓存（key: `app_log_keys_{appId}`），图表数据不缓存 |
| **错误处理** | useRequest 默认 errorToast，无自定义错误处理 |
| **轮询** | 无轮询，仅在 refreshDeps 变化时请求 |
| **竞态处理** | useRequest 内置取消前次未完成请求 |

> 注：本模块自身不定义 API 函数，所有 API 函数定义在 `web/core/app/api/log.ts` 中，由依赖的 `LogChart`、`LogsContextProvider`、`TotalData` 组件调用。
