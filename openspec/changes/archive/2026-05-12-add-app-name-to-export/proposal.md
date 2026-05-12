## Why

当前导出应用配置(复制到剪切板/导出JSON)时,仅包含 `nodes`、`edges`、`chatConfig` 三部分,缺少应用的 `name`(名称)和 `intro`(介绍)信息。用户在导入时需手动填写名称和介绍,操作繁琐且容易遗漏。将名称和介绍纳入导出数据,可在导入时自动回填,提升用户体验和配置迁移效率。

## What Changes

- 在 Dashboard Agent 列表页的导出配置(`ExportConfigPopover`)中,向导出 JSON 增加 `name` 和 `intro` 字段
- 在应用详情页(`AppDetail`)的导出配置中,向导出 JSON 增加 `name` 和 `intro` 字段
- 在 JSON 导入弹窗(`JsonImportModal`)中,自动从导入的 JSON 中读取 `name` 和 `intro` 字段并回填到表单
- 导入时若 JSON 中存在 `name`,则自动填充名称输入框;若存在 `intro`,则一并传给创建接口

## Capabilities

### New Capabilities

- `export-app-name-intro`: 在应用配置导出中包含 name 和 intro 字段,并在导入时自动回填

### Modified Capabilities

<!-- No existing specs to modify -->

## Impact

- `projects/app/src/pageComponents/dashboard/agent/ExportConfigPopover.tsx`: 导出数据结构增加 `name`、`intro` 字段
- `projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx`: 同上
- `projects/app/src/pageComponents/dashboard/agent/JsonImportModal.tsx`: 导入时读取并回填 `name`、`intro`
- 向后兼容:旧版导出的 JSON(不含 name/intro)导入时不受影响,用户仍可手动填写名称
