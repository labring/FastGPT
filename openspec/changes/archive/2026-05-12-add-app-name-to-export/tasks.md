## 1. Dashboard 列表页导出 - 增加 name/intro

- [x] 1.1 在 `pageComponents/dashboard/agent/ExportConfigPopover.tsx` 中,从 `getAppDetailById` 返回的 `appDetail` 取 `name` 和 `intro`,加入导出 JSON 对象

## 2. 应用详情页导出 - 增加 name/intro

- [x] 2.1 在 `pageComponents/app/detail/ExportConfigPopover.tsx` 中,`ExportConfigPopoverProps` 新增 `appIntro?: string` prop
- [x] 2.2 在详情导出的 JSON 构建中(workflow 和 form 两种路径),加入 `name: appName` 和 `intro: appIntro`
- [x] 2.3 更新 `SimpleApp/AppCard.tsx` 中对 `ExportConfigPopover` 的调用,传入 `appIntro={appDetail.intro}`
- [x] 2.4 更新 `WorkflowComponents/AppCard.tsx` 中对 `ExportConfigPopover` 的调用,传入 `appIntro={appDetail.intro}`
- [x] 2.5 更新 `Edit/FormComponent/AppCard.tsx` 中对 `ExportConfigPopover` 的调用,传入 `appIntro={appDetail.intro}`

## 3. JSON 导入 - 自动回填 name/intro

- [x] 3.1 在 `pageComponents/dashboard/agent/JsonImportModal.tsx` 的 `onSubmit` 中,从解析后的 JSON 读取 `name` 和 `intro`
- [x] 3.2 若 JSON 中存在 `name` 且当前无 UTM 名称,使用 `setValue` 预填名称输入框
- [x] 3.3 将 JSON 中的 `intro` 传入 `postCreateApp` 调用

## 4. 验证

- [x] 4.1 在 Dashboard 列表页导出配置,验证 JSON 包含 name 和 intro
- [x] 4.2 在应用详情页导出配置,验证 JSON 包含 name 和 intro
- [x] 4.3 导入含 name/intro 的 JSON,验证名称自动填充、介绍正常传入
- [x] 4.4 导入不含 name/intro 的旧版 JSON,验证功能正常(手动填写名称)
