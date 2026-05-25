## 1. Schema 新增 `permissionSync` 到 `APIFileServerSchema`

- [x] 1.1 在 `packages/global/core/dataset/apiDataset/type.ts` 的 `APIFileServerSchema` 中新增 `permissionSync: z.boolean().optional().meta({ description: '是否同步权限' })`
- [x] 1.2 随 `apiDatasetServer.apiServer` 对象序列化到 MongoDB，无需单独 Schema 改动

## 2. CreateModal 弹窗改动

- [x] 2.1 弹窗宽度从 `w={'490px'}` 改为 `w={'600px'}`
- [x] 2.2 在自动同步 Switch 后新增可点击提示文字「调用同步API实现实时同步」（仅 `type === apiDataset` 时展示），点击打开弹窗，弹窗内容标记 TODO（已由 10.1 正式实现）
- [x] 2.3 新增「权限同步」表单行：`FormLabel` + `QuestionTip`（悬浮提示文案）+ `Switch` + 说明文字「开启后使用同步的权限，不再支持此处设置（请保障已进行账号同步）」（仅 `type === apiDataset` 时展示）
- [x] 2.4 `onclickCreate` 中 `apiDatasetServer` 已自动携带 `permissionSync`，无需额外处理
- [x] 2.5 编辑模式下 `apiDatasetServer` 已通过 `data.apiDatasetServer as any` 整体回填，`permissionSync` 随对象自动回填

## 3. 文件操作菜单改动（RefinedCollectionCard）

- [x] 3.1 从 `DatasetPageContext` 读取 `datasetDetail.apiDatasetServer?.apiServer?.permissionSync`
- [x] 3.2 在 `permissionItem` 中：当 `permissionSync === true` 时，菜单项 `isDisabled` 并展示 tooltip「知识库已开启权限同步，不再支持此处设置」
- [x] 3.3 在 `sourceItem` 中：当数据集类型为 `apiDataset` 时，添加 TODO 注释标记查看原文跳转到第三方文件库的逻辑
- [x] 3.4 `fileDataCard` 类型的文件列表如有权限操作菜单同样需要处理（检查后无权限菜单，无需改动）

## 4. 添加文件流程简化（仅 apiDataset）

- [x] 4.1 在 `Import/Context.tsx` 的 `modeSteps` 中，将 `apiDataset` 的 steps 改为仅 1 步：`[{ title: t('dataset:import_select_file') }]`
- [x] 4.2 在 `Import/diffSource/APIDataset.tsx` 中，移除 `activeStep === 1/2/3` 的渲染，只保留 `activeStep === 0`
- [x] 4.3 修改 `onclickNext` 逻辑：选择文件后直接调用创建 API，携带 `defaultFormData` 作为参数
- [x] 4.4 确保步骤导航 UI（MyStep）在 apiDataset 时不显示（只有 1 步无需导航）

## 5. 权限收紧

- [x] 5.1 在 `NewList.tsx:174`，将非 folder 类型的 `hasMenuPer` 从 `hasWritePer` 改为 `hasManagePer`
- [x] 5.2 在 `Info/index.tsx:149-163`，编辑图标用 `datasetDetail.permission.hasManagePer` 包裹，仅管理员可见

## 6. 国际化词条

- [x] 6.1 在 `packages/web/i18n/zh-CN/dataset.json` 中新增词条：`permission_sync`、`permission_sync_tip`、`permission_sync_desc`、`sync_api_tip`、`permission_sync_disabled_tip`、`sync_api`、`api_request`、`api_response`、`click_sync_first`、`sync`、`sync_failed`
- [x] 6.2 在 `packages/web/i18n/zh-Hant/dataset.json` 中新增对应繁体词条
- [x] 6.3 在 `packages/web/i18n/en/dataset.json` 中新增对应英文词条

## 7. 验证

- [x] 7.1 验证 CreateModal 弹窗宽度为 600px
- [x] 7.2 验证 apiDataset 类型创建/编辑时，自动同步提示和权限同步字段正确展示
- [x] 7.3 验证非 apiDataset 类型不展示新增字段
- [x] 7.4 验证权限同步开启后，文件列表权限操作被禁用并显示 tooltip
- [x] 7.5 验证 apiDataset 添加文件流程只有 1 步，参数使用默认值正常提交
- [x] 7.6 验证 write 权限用户看不到编辑按钮，manage 权限用户正常看到
- [x] 7.7 验证 permissionSync 字段正确存取（新建 + 编辑回填）

## 8. Bug 修复

- [x] 8.1 `filterApiDatasetServerPublicData`（`packages/global/core/dataset/apiDataset/utils.ts`）在构造 `apiServer` 返回对象时补充 `permissionSync` 字段，否则 `detail` 接口始终丢失该字段

## 9. 添加文件弹窗重构（apiDataset 直接在当前页弹窗）

- [x] 9.1 新建 `RefinedCollectionCard/APIFileSelectModal.tsx`：从 `Import/diffSource/APIDataset.tsx` 的 `CustomAPIFileInput` 提炼，接受 `isOpen/onClose/parentId/onSuccess` props，不依赖 `DatasetImportContext`，成功后调用 `onSuccess()` + `onClose()` 而非 `router.replace`
- [x] 9.2 在 `Import/diffSource/APIDataset.tsx` 顶部添加注释，说明该文件供 Import 页流程使用，当前页弹窗请用 `APIFileSelectModal.tsx`
- [x] 9.3 修改 `CollectionNavActions.tsx`：「添加文件」按钮改为 `setShowAPIFileSelectModal(true)`，移除 `router.replace` 跳转逻辑；动态引入 `APIFileSelectModal` 并在弹窗区域渲染；清理不再使用的 `ImportDataSourceEnum` 和 `TabEnum` import

## 10. 同步 API 弹窗实现

- [x] 10.1 在 `CreateModal.tsx` 中将 TODO 弹窗替换为正式实现：使用 `FillRowTabs` 切换「接口请求」/「接口响应」tab，`CodeLight` 展示动态 curl 命令和 JSON 响应，调用 `postDatasetSync` API
- [x] 10.2 新增 i18n 词条：`sync_api`、`api_request`、`api_response`、`click_sync_first`、`sync`、`sync_failed`（三语）
