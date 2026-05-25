## Context

API 文件库（apiDataset）允许用户接入第三方文件系统（如 API 服务器提供的文件）。当前系统存在以下缺口：

1. **无权限同步机制**：第三方文件库可能自带权限体系，但 FastGPT 无法感知和使用这些权限
2. **添加文件流程冗余**：API 文件库添加文件需要经过 4 个步骤，但实际上参数设置、数据预览、确认上传等步骤对 API 文件库意义不大
3. **编辑权限不一致**：前端使用 `hasWritePer` 控制编辑按钮可见性，但后端 API 校验 `ManagePermissionVal`，导致 write 权限用户看到编辑按钮但 API 返回 403

## Goals / Non-Goals

**Goals:**
- CreateModal 新增 `permissionSync` 开关，仅 apiDataset 类型可见
- 自动同步 Switch 后新增可点击提示（仅 apiDataset），点击打开弹窗（TODO）
- 权限同步开启后，文件列表操作菜单的「权限」选项禁用并展示 tooltip
- 文件列表「查看原文」菜单项标记 TODO，留待开发者验证第三方跳转逻辑
- API 文件库添加文件流程简化为 1 步，使用默认参数自动提交，放在myModal组件里面
- 前端编辑知识库按钮统一要求 `hasManagePer`

**Non-Goals:**
- 不实现权限同步的实际后端同步逻辑
- 不实现自动同步 API 弹窗的具体内容 → 已实现：表格展示「接口请求」/「接口响应」两个 tab，调用 `postDatasetSync` API
- 不实现「查看原文」跳转到第三方文件库的具体逻辑
- 不修改后端 API 的权限校验逻辑（已正确校验 ManagePermissionVal）
- 不涉及 feishu / yuque / websiteDataset 类型

## Decisions

### 1. permissionSync 放入 APIFileServerSchema

- `permissionSync` 仅在 `DatasetTypeEnum.apiDataset` 时展示
- 放入 `packages/global/core/dataset/apiDataset/type.ts` 的 `APIFileServerSchema` 中
- 随 `apiDatasetServer.apiServer` 对象整体序列化到 MongoDB
- 前端访问路径：`datasetDetail.apiDatasetServer?.apiServer?.permissionSync`
- 表单路径：`form.watch('apiDatasetServer.apiServer.permissionSync')`
- ApiDatasetForm 逐字段 register，不会覆盖 permissionSync
- **`filterApiDatasetServerPublicData`（utils.ts）在白名单展开 `apiServer` 字段时必须显式包含 `permissionSync`，否则 detail 接口返回数据中该字段丢失**

### 2. 添加文件简化：去掉步骤导航 + 直接提交

- `Context.tsx` 中 apiDataset 的 steps 改为单步
- `APIDataset.tsx` 中只渲染 `activeStep === 0`（CustomAPIFileInput）
- 选择文件后 `goToNext` 改为直接调用提交 API，携带 `defaultFormData`
- **进一步重构（v2）**：发现 Import 页流程仍会触发页面跳转再弹窗，体验割裂。将 `CustomAPIFileInput` 提炼为独立组件 `RefinedCollectionCard/APIFileSelectModal.tsx`，`CollectionNavActions.tsx` 的「添加文件」按钮直接打开该 Modal，完全绕开 Import 页路由。`APIDataset.tsx` 原文件保留供 Import 流程使用，顶部添加注释说明。

### 3. 权限收紧范围：仅两处

- `NewList.tsx:174`：`hasMenuPer` 对非 folder 类型从 `hasWritePer` 改为 `hasManagePer`
- `Info/index.tsx:149-163`：编辑图标包裹 `hasManagePer` 检查

### 4. 查看原文 TODO 处理

- 在 `RefinedCollectionCard/index.tsx` 的 `sourceItem.onClick` 中，对 apiDataset 类型添加 TODO 注释标记
- 保持现有 `handleReadSource` 逻辑不变

## Risks / Trade-offs

- **添加文件简化**：跳过参数设置后用户无法自定义 chunk 参数，需确保 `defaultFormData` 的默认值合理
- **权限收紧**：对已有 write 权限的用户，编辑按钮会消失，属于预期行为（与后端校验对齐）
- **permissionSync 向前兼容**：默认 `false`，旧数据不受影响
