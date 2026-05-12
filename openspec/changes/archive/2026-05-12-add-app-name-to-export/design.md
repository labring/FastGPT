## Context

当前 FastGPT 应用配置导出功能位于两处:

1. **Dashboard Agent 列表页** (`ExportConfigPopover.tsx`): 接收 `appName` + `appId`,动态获取 `appDetail`,导出 `{ nodes, edges, chatConfig }`
2. **应用详情页** (`ExportConfigPopover.tsx`): 接收 `appName` + `chatConfig` + workflow/form 数据,导出 `{ nodes, edges, chatConfig }` 或 form 数据

导入端 (`JsonImportModal.tsx`) 解析 JSON 后仅提取 `nodes`、`edges`、`chatConfig` 用于创建应用,名称和介绍始终需要用户手动输入。

## Goals / Non-Goals

**Goals:**
- 导出时在 JSON 中包含 `name` 和 `intro` 字段
- 导入时自动从 JSON 中读取 `name` 和 `intro` 并回填,减少手动操作
- 保持向后兼容:旧版不含 name/intro 的 JSON 导入不受影响

**Non-Goals:**
- 不涉及 avatar 字段的导出/导入(当前导入已通过类型推断自动选择图标)
- 不改变现有的敏感信息过滤逻辑
- 不修改导出文件格式(仍为 JSON)

## Decisions

### 1. 在导出 JSON 顶层增加 `name` 和 `intro` 字段

**方案选择**: 在现有 `{ nodes, edges, chatConfig }` 结构同级增加字段,而非嵌套在某个对象内。

- Dashboard 导出: 直接从 `appDetail` 取值 `appDetail.name` 和 `appDetail.intro`
- Detail 导出: `name` 已有 prop `appName`,`intro` 需新增 prop `appIntro`

### 2. 导入时 name 优先使用 JSON 中的值

在 `JsonImportModal` 中,解析 JSON 后:
- 若 `parsed.name` 存在 → 用 `setValue('name', parsed.name)` 预填
- 若 `parsed.intro` 存在 → 传入 `postCreateApp({ intro: parsed.intro })`
- 若不存在 → 保持现有行为(用户手动填写,`utmParams` 名称优先)

**UTM 名称优先级**: 当存在 UTM 短链名称(`utmParams.shortUrlContent`)时,UTM 名称仍优先于 JSON 中的 name,因为 UTM 是更明确的外部意图。

### 3. Detail 导出接口变更:新增 `appIntro` 可选 prop

`ExportConfigPopoverProps` 增加 `appIntro?: string`,三个调用方均传入 `appDetail.intro`。

## Risks / Trade-offs

- **导入处 name 覆盖风险** → 用户可能不希望自动覆盖。缓解措施:仅在 JSON 中 `name` 字段存在时才预填,用户仍可手动修改;UTM 名称仍保持最高优先级
- **intro 字段可能为 undefined** → 导出时 intro 可能为空字符串或 undefined,JSON.stringify 会正确处理。导入时做空值检查即可
