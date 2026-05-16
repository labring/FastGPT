## Why

API 文件库（apiDataset）需要支持权限同步功能，简化添加文件流程，并收紧知识库编辑权限控制。当前系统缺少权限同步开关，添加文件流程步骤过多，且编辑权限的判断不一致（前端 write、后端 manage）。

## What Changes

- **CreateModal 弹窗宽度**：490px → 600px
- **自动同步提示**：apiDataset 类型的自动同步 Switch 后新增可点击提示「调用同步API实现实时同步」，点击打开弹窗（标记 TODO）
- **权限同步字段**：apiDataset 新增 `permissionSync` 开关，开启后文件列表中的权限操作将被禁用
- **文件菜单权限禁用**：权限同步开启后，文件操作菜单的「权限」选项禁用并展示 tooltip 提示
- **查看原文跳转**：apiDataset 文件列表「查看原文」跳转到第三方文件库（标记 TODO）
- **添加文件简化**：apiDataset 添加文件流程从 4 步（选择文件→参数设置→数据预览→确认上传）简化为 1 步（选择文件），参数使用默认值
- **权限收紧**：知识库编辑按钮从 `hasWritePer` 收紧为 `hasManagePer`

## Capabilities

### New Capabilities

- `dataset-permission-sync`: API 文件库权限同步功能，开启后文件权限由第三方系统管理
- `api-dataset-import-simplify`: API 文件库添加文件流程简化，一步选择即可

### Modified Capabilities

- `dataset-edit-permission`: 编辑知识库信息权限从 write 收紧为 manage

## Impact

- `packages/global/core/dataset/type.ts`: 新增 `permissionSync` 字段
- `packages/service/core/dataset/schema.ts`: MongoDB Schema 新增 `permissionSync` 字段
- `projects/app/src/pageComponents/dataset/list/CreateModal.tsx`: 弹窗宽度、自动同步提示、权限同步字段
- `projects/app/src/pageComponents/dataset/detail/RefinedCollectionCard/index.tsx`: 文件菜单权限禁用、查看原文 TODO
- `projects/app/src/pageComponents/dataset/detail/Import/diffSource/APIDataset.tsx`: 简化导入步骤
- `projects/app/src/pageComponents/dataset/detail/Import/Context.tsx`: apiDataset 步骤配置简化
- `projects/app/src/pageComponents/dataset/list/NewList.tsx`: 编辑按钮权限收紧
- `projects/app/src/pageComponents/dataset/detail/Info/index.tsx`: 编辑按钮权限收紧
- `packages/web/i18n/*/dataset.json`: 新增国际化词条
