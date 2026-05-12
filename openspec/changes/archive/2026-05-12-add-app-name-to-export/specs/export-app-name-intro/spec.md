## ADDED Requirements

### Requirement: Export includes app name and intro

应用配置导出 JSON SHALL 包含应用的 `name`(名称)和 `intro`(介绍)字段,与 `nodes`、`edges`、`chatConfig` 平级。

#### Scenario: Dashboard 列表页导出包含 name 和 intro

- **WHEN** 用户在 Dashboard Agent 列表页通过 ExportConfigPopover 导出应用配置(复制到剪切板或下载 JSON)
- **THEN** 导出的 JSON 对象 MUST 包含 `name` 和 `intro` 字段,值来自应用详情的对应属性

#### Scenario: 应用详情页导出包含 name 和 intro

- **WHEN** 用户在应用详情页通过 ExportConfigPopover 导出应用配置
- **THEN** 导出的 JSON 对象 MUST 包含 `name` 和 `intro` 字段,`name` 来自组件 props,`intro` 来自新增的 `appIntro` prop

### Requirement: Import auto-fills name and intro from JSON

JSON 导入弹窗 SHALL 从导入的 JSON 中自动读取 `name` 和 `intro` 字段并回填,减少用户手动输入。

#### Scenario: 导入含 name 的 JSON 自动填充名称

- **WHEN** 用户导入包含 `name` 字段的 JSON 配置
- **THEN** 名称输入框 MUST 自动填充为 JSON 中的 `name` 值,用户仍可手动修改

#### Scenario: 导入含 intro 的 JSON 自动传入介绍

- **WHEN** 用户导入包含 `intro` 字段的 JSON 配置并确认创建
- **THEN** `postCreateApp` 的调用参数 MUST 包含 JSON 中的 `intro` 值

#### Scenario: 导入不含 name/intro 的旧版 JSON 兼容

- **WHEN** 用户导入不包含 `name` 或 `intro` 字段的旧版导出 JSON
- **THEN** 名称输入框 MUST 保持空白(或保持 UTM 填充值),创建时 intro 为空,不影响正常导入流程

### Requirement: UTM 名称优先级高于 JSON name

当同时存在 UTM 短链名称和 JSON 中的 name 时,UTM 名称 SHALL 优先。

#### Scenario: UTM 与 JSON name 同时存在

- **WHEN** 导入流程中同时存在 UTM 短链携带的 `shortUrlContent` 名称和 JSON 中的 `name` 字段
- **THEN** 名称输入框 MUST 使用 UTM 名称,而非 JSON 中的 name
