## Context

FastGPT 有两个日志查看页面，分别是通用应用的 `Logs` 和智能客服应用的 `ConversationLogs`。两者共用同一套后端导出 API (`/api/core/app/logs/exportLogs`)，但前后端交互模式不同：

- **Logs 页面**：使用 `LogsContext` 集中管理筛选状态，`LogTable` 通过回调注入模式将 `exportLogs` 函数写入 Context，父组件的 `PopoverConfirm` 在确认后调用
- **ConversationLogs 页面**：`LogFilters` 独立管理筛选状态，通过 `onFiltersChange` 回调传给父组件，目前仅在 `optimize` 子标签有导出（导出的是纠错记录，调用不同 API）

经代码审查发现：Logs 导出请求参数与表格查询参数基本一致，后端 `where` 子句也完全相同，前端代码无逻辑错误。导出空数据的根因大概率在后端聚合管道或 MongoDB cursor 层面。

ConversationLogs 缺少列表导出是明确的功能缺失，需要新增。

### 现有导出架构

```
┌─ Logs 页面 ─────────────────────────────────────────────────────────────┐
│                                                                         │
│  LogsContext (共享筛选状态)                                              │
│  │                                                                      │
│  └─→ LogsInner (index.tsx)                                              │
│       │                                                                 │
│       ├─ 筛选栏 (DateRangePicker, MultipleSelect, UserFilter, etc.)     │
│       │                                                                 │
│       ├─ [PopoverConfirm] export button                                 │
│       │   └─ onConfirm={onExport}  ← LogTable 通过 useEffect 注入       │
│       │                                                                 │
│       └─ LogTable                                                       │
│            ├─ usePagination(getAppChatLogs) → 表格数据                   │
│            ├─ exportLogs() → downloadFetch('/api/core/app/logs/exportLogs') │
│            └─ useEffect → setOnExport(exportLogs) 注入到 Context         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─ ConversationLogs 页面 (重构后) ─────────────────────────────────────────┐
│                                                                         │
│  ConversationLogs (本地 state + 导出逻辑)                                │
│  │                                                                      │
│  ├─ SubTabHeader                                                        │
│  │  ├─ FillRowTabs (list | optimize)                                   │
│  │  │                                                                   │
│  │  ├─ [subTab === 'optimize']                                          │
│  │  │   ├─ DateRangePicker + [MyTooltip + Button] export button        │
│  │  │   └─ handleExport → exportChatCorrectionRecords()                 │
│  │  │                      → /api/core/chat/correction/export (Excel)   │
│  │  │                                                                   │
│  │  └─ [subTab === 'list']                                              │
│  │      ├─ LogFilters (独立管理筛选状态 + onFiltersChange 回调)          │
│  │      └─ PopoverConfirm                                               │
│  │           ├─ content={t('app:logs_export_confirm_tip', { total })}   │
│  │           └─ onConfirm={handleExportLogs}  ← 直接指向本地导出函数      │
│  │                                                                      │
│  └─ Content                                                             │
│     ├─ LogList (subTab === 'list')                                      │
│     │   └─ usePagination(getAppChatLogs)                                │
│     │   └─ onTotalChange → 通知父组件 total 变化                         │
│     └─ OptimizeRecords (subTab === 'optimize')                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- 修复 Logs 页面导出空数据问题，使导出的 CSV 文件包含实际数据
- 为 ConversationLogs 列表页添加导出按钮，功能与 Logs 页面一致（PopoverConfirm + 总条数提示 + CSV 导出）
- 让后端 `list.ts` 和 `exportLogs.ts` 原生支持 `feedbackFilter` 参数（该参数已存在于 Schema 中但从未被消费），同时修复 ConversationLogs 列表筛选不生效的既有 bug
- 修复 LogTable 中 `unreadOnly` 参数在导出和列表查询间不一致的问题

**Non-Goals:**
- 不重构 LogsContext 或 ConversationLogs 的整体状态管理架构
- ~~不修改 `/api/core/app/logs/exportLogs` 的聚合管道结构（除非确认根因在后端）~~ **已修改**：根因确认为聚合管道 `$lookup` 语法错误，已修复（见 F1）
- 不在 ConversationLogs 的 optimize tab 添加 PopoverConfirm（保持现有 MyTooltip 风格）
- 不添加新的 i18n 词条（复用现有词条：`common:Export`、`app:logs_export_confirm_tip`）

## Decisions

### D1: Logs 导出空数据 —— 修复策略

**决策**: 优先在后端添加错误日志和防御性检查，同时修复前端的参数一致性问题。

**理由**: 代码审查未发现明显逻辑错误，大概率是 MongoDB cursor 流或聚合管道在特定数据/环境下产生空结果。添加日志有助于定位根因。前端修复 `unreadOnly` 不一致是防御性的。

**备选方案**: 在前端做降级处理（导出失败时提示用户缩小筛选范围）→ 但这掩盖了根因，不可取。

### D2: ConversationLogs 导出按钮 —— 导出函数位置

**决策**: 导出函数 `handleExportLogs` **直接在 ConversationLogs 父组件中定义**，不从 LogList 通过回调注入。

```
ConversationLogs (父组件)
├── handleExportLogs() → 直接读取 logFilters state → downloadFetch()
├── exportTotal state (由 LogList 通过 onTotalChange 回传)
│
├── SubTabHeader
│   └── [subTab === 'list']
│       ├── LogFilters
│       └── PopoverConfirm
│           ├── content={t('app:logs_export_confirm_tip', { total: exportTotal })}
│           └── onConfirm={handleExportLogs}
│
└── LogList
    ├── usePagination(getAppChatLogs) → { total, ... }
    └── onTotalChange → 通知父组件 total 变化
```

**理由**: 
- LogList 不拥有任何导出需要而父组件没有的数据（`appId`、`appName`、`logFilters` 全在父组件或其 Context 中）
- 回调注入模式引入了多余的 state（`onExportList`）、`useEffect` 回传，以及 **undefined 初始值的时序窗口**（用户可能在 LogList 注入前点击导出，此时 `onExportList` 为 undefined）
- 将导出函数放在数据所属位置（父组件），遵循单一数据源原则

**备选方案**: 
- ~~回调注入模式（与 Logs 页面一致）~~ → ~~增加复杂度，引入时序 bug~~
- ~~在父组件单独调用 API 获取 total~~ → 不必要，LogList 已有 total

### D3: 让后端原生支持 `feedbackFilter`（而非前端转换）

**决策**: 在 `list.ts` 和 `exportLogs.ts` 的 where 子句中直接消费 `feedbackFilter` 参数，不做前端转换。

**理由**: 
- `feedbackFilter` 已存在于 `GetAppChatLogsBodySchema` 中，只是从未被后端消费——ConversationLogs 列表筛选本身就是坏的（发送了参数但被忽略）
- 前端转换 `feedbackFilter`（数组）→ `feedbackType`（字符串）会丢失 `noFeedback` 语义，因为 `feedbackType` 枚举中没有对应值
- 修复后端消费逻辑可以同时解决两个 bug：ConversationLogs 列表筛选不生效 + 导出需要前端做有损转换

**feedbackFilter 在 where 子句中的映射逻辑**:

```typescript
// 在 list.ts 和 exportLogs.ts 的 where 子句中新增
// feedbackFilter 非全选时构建 MongoDB 条件
// 注意: 与 feedbackType 互斥（通过 !feedbackType 守卫），LogTable 用 feedbackType，LogList 用 feedbackFilter
const feedbackFilterCondition =
  !feedbackType && feedbackFilter && feedbackFilter.length < 3
    ? (() => {
        const hasGood = feedbackFilter.includes(FeedbackFilterEnum.good);
        const hasBad = feedbackFilter.includes(FeedbackFilterEnum.bad);
        const hasNo = feedbackFilter.includes(FeedbackFilterEnum.noFeedback);

        if (feedbackFilter.length === 1) {
          if (hasGood) return { hasGoodFeedback: true };
          if (hasBad) return { hasBadFeedback: true };
          return { hasGoodFeedback: { $ne: true }, hasBadFeedback: { $ne: true } };
        }
        // 两个选中 — 排除缺失的第三个
        if (hasGood && hasBad) return { $or: [{ hasGoodFeedback: true }, { hasBadFeedback: true }] };
        if (hasGood && hasNo) return { hasBadFeedback: { $ne: true } };
        return { hasGoodFeedback: { $ne: true } };
      })()
    : {};
```

**各组合的 MongoDB 条件映射**:

| feedbackFilter | MongoDB 条件 |
|---|---|
| 未传或全选 3 项 | 无筛选 |
| `['good']` | `{ hasGoodFeedback: true }` |
| `['bad']` | `{ hasBadFeedback: true }` |
| `['noFeedback']` | `{ hasGoodFeedback: {$ne: true}, hasBadFeedback: {$ne: true} }` |
| `['good', 'bad']` | `{$or: [{hasGoodFeedback: true}, {hasBadFeedback: true}]}` |
| `['good', 'noFeedback']` | `{ hasBadFeedback: {$ne: true} }` |
| `['bad', 'noFeedback']` | `{ hasGoodFeedback: {$ne: true} }` |

**备选方案**: 前端转换 → 已否决，原因见上。

### D4: dateRange 来源

**决策**: 导出时使用 `logFilters.dateRange`（LogFilters 组件内部的日期范围），而非 ConversationLogs 父组件的 `dateRange`。

**理由**: ConversationLogs 的 `dateRange` 目前仅供 optimize tab 使用。LogFilters 独立管理自己的日期范围，导出应与用户看到的筛选条件一致。

### D5: sourcesMap 构建

**决策**: 在 ConversationLogs 的导出函数中内联构建 `sourcesMap`（与 LogTable 中的方式相同），从 `ChatSourceMap` 常量映射。

**理由**: 简单直接，无需将 sourcesMap 加入 LogFiltersType。

## Risks / Trade-offs

- **[feedbackFilter 影响 Logs 页面 list 查询]**：`list.ts` 新增 `feedbackFilter` 消费后，Logs 页面的 LogTable 不会发送此参数（LogTable 用 `feedbackType`），但两者在 where 子句中通过不同字段独立工作，互不干扰。ConversationLogs 的 LogList 目前也不发送 `feedbackType`，后端两个参数各自独立生效。
- **[total 可能为 0]**：若 LogList 未加载完成或筛选条件无匹配，total 为 0 → `PopoverConfirm` 仍显示 "共 0 条"，用户确认后导出空文件（合乎逻辑）

## Confirmed Findings

### F1: Logs 导出空数据/500 根因 —— 聚合管道 `$lookup` 语法错误

**发现**: `exportLogs.ts` 的 MongoDB 聚合管道中，第三个 `$lookup`（关联 `AppVersionCollectionName`）同时使用了 `localField`/`foreignField`（简单模式）和 `pipeline`（管道模式），这在 MongoDB 中是非法的，MongoDB 返回 `FailedToParse` 错误（code 9）。

**影响分析**:
```
              ┌──── $match 命中文档 ──→ $lookup 执行 ──→ MongoDB 报错 ──→ 500
              │                        (语法错误)
聚合管道开始 ──┤
              └──── $match 命中 0 条  ──→ 跳过后续 stage ──→ cursor end ──→ 空 CSV
                                          (看起来正常)
```
- 筛选有数据 → **500 错误**（用户无法导出）
- 筛选无数据 → **空文件**（用户以为导出正常但无内容）
- 两种表现指向同一根因，此前被误判为"时好时坏"

**修复**: 将 `$lookup` 改为纯管道模式（`let` + `pipeline` + `$expr`），与文件内前两个 `$lookup` 保持一致。

**代码位置**: `projects/app/src/pages/api/core/app/logs/exportLogs.ts` 第 285-304 行
