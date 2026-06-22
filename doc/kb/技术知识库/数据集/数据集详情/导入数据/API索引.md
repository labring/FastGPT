---
capability_label: 导入数据
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:41:34Z"
parent_module: 数据集详情
roles: [管理员, 成员]
router_paths: [/dataset/detail?currentTab=import]
---

# 导入数据 — API索引

## 文件上传

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/file/presignDatasetFilePostUrl` | POST | 获取 S3 预签名上传 URL | `api/file.ts:9` → `FileLocal.tsx:162` | 数据集详情→导入→本地文件→选择文件后上传时调用 |
| `/core/dataset/file/getPreviewChunks` | POST | 预览文件分块结果 | `api/file.ts:12` → `PreviewData.tsx:59` | 数据集详情→导入→数据预览步骤→点击文件时调用（本地文件/链接/外部文件/API数据集/重训练） |

## 集合创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/create/fileId` | POST | 根据已上传文件 ID 创建集合 | `api/collection.ts:62` → `Upload.tsx` | 数据集详情→导入→本地文件→确认上传时调用 |
| `/core/dataset/collection/create/link` | POST | 根据网页链接创建集合 | `api/collection.ts:70` → `Upload.tsx` | 数据集详情→导入→网页链接→确认上传时调用 |
| `/core/dataset/collection/create/text` | POST | 根据自定义文本创建集合 | `api/collection.ts:72` → `Upload.tsx` | 数据集详情→导入→自定义文本→确认上传时调用 |
| `/core/dataset/collection/create/images` | POST | 创建图片数据集集合 | `image/api.ts:4` → `FileLocal.tsx:123`、`ImageDataset.tsx` | 数据集详情→导入→本地文件（含图片时）/图片数据集→上传时调用 |
| `/core/dataset/collection/create/custom/apiCollectionV2` | POST | 根据 API 数据集文件批量创建集合 | `api/collection.ts:78` → `Upload.tsx` | 数据集详情→导入→API数据集→确认上传时调用 |
| `/proApi/core/dataset/collection/create/externalFileUrl` | POST | 根据外部文件 URL 创建集合 | `api/collection.ts:83` → `Upload.tsx` | 数据集详情→导入→外部文件→确认上传时调用 |
| `/core/dataset/collection/create/reTrainingCollection` | POST | 对已有集合重新训练 | `api/collection.ts:66` → `Upload.tsx` | 数据集详情→导入→重训练→确认上传时调用 |

## API 数据集

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/apiDataset/list` | POST | 获取 API 数据集文件/文件夹列表 | `api/apiDataset.ts:13` → `APIDataset.tsx` | 数据集详情→导入→API数据集→浏览文件目录时调用（含分页和搜索） |
| `/core/dataset/apiDataset/listExistId` | GET | 获取已导入的文件 ID 集合 | `api/apiDataset.ts:16` → `APIDataset.tsx` | 数据集详情→导入→API数据集→加载时调用，用于禁用已导入的文件 |

## 集合查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/detail` | GET | 获取集合详情 | `api/collection.ts:43` → `ReTraining.tsx:29` | 数据集详情→导入→重训练→加载时调用，获取已有集合训练参数 |

## 数据库

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/database/checkConnection` | POST | 测试数据库连通性 | `api.ts:534` → `ConnectDatabaseForm.tsx` | 数据集详情→导入→数据库→连接配置→点击「测试连接」时调用 |
| `/core/dataset/database/getConfiguration` | GET | 获取数据库表/列配置 | `api.ts:525` → `useDataBaseConfig.ts` | 数据集详情→导入→数据库→表配置步骤→加载时调用 |
| `/core/dataset/database/detectChanges` | POST | 检测数据库表/列变更 | `api.ts:508` → `useDataBaseConfig.ts` | 数据集详情→导入→数据库→编辑模式→检测变更时调用 |
| `/core/dataset/database/createCollections` | POST | 根据数据库配置创建知识库集合 | `api.ts:518` → `useDataBaseConfig.ts` | 数据集详情→导入→数据库→表配置确认→新建模式提交时调用 |
| `/core/dataset/database/applyChanges` | POST | 应用数据库配置变更 | `api.ts:502` → `useDataBaseConfig.ts` | 数据集详情→导入→数据库→表配置确认→编辑模式提交时调用 |
| `/core/dataset/update` | PUT | 更新数据集基本信息（含数据库配置） | `api.ts:153` → `ConnectDatabaseForm.tsx` | 数据集详情→导入→数据库→编辑模式→连接步骤确认时调用 |

---

## API 调用链追踪

### `/core/dataset/file/presignDatasetFilePostUrl` 调用链

```
FileLocal.tsx (SelectFile 组件)
  ├── 触发: 用户选择文件后自动触发的上传流程
  ├── 参数: { filename, datasetId }
  └── 响应处理: 获取 { url, key, headers } → 用于后续 putFileToS3 上传

FileLocal.tsx (putFileToS3)
  ├── 触发: 获取预签名 URL 后立即执行
  ├── 参数: { url, file, headers, maxSize, onUploadProgress }
  └── 响应处理: 进度回调更新 selectFiles state → 完成后设置 dbFileId=key
```

### `/core/dataset/file/getPreviewChunks` 调用链

```
PreviewData.tsx
  ├── 触发: 用户在预览步骤点击某个来源文件
  ├── 参数: { datasetId, type, sourceId, chunkSize, overlapRatio, ...分块参数 }
  ├── 分支: fileCustom 类型走前端 splitText2Chunks（不调此 API）；其他类型调用后端
  └── 响应处理: 返回 { chunks: [{q, a}], total } → 渲染分块预览列表；total===0 时 toast 警告

PreviewData.tsx (getPreviewSourceReadType 工具)
  ├── 触发: 构造 API 参数时
  ├── 参数: previewSource (ImportSourceItemType)
  └── 响应: 返回 DatasetSourceReadTypeEnum (fileLocal|link|apiFile|externalFile)
```

### `/core/dataset/collection/create/fileId` 调用链

```
Upload.tsx
  ├── 触发: 用户在「确认上传」步骤点击「开始上传」
  ├── 参数: { datasetId, parentId, fileId, ...分块参数, ...processParamsForm }
  ├── 串行: 逐个处理 sources 列表中 createStatus==='waiting' 的项
  └── 响应处理: 成功 → 更新该项 createStatus='finish'；失败 → createStatus='waiting'+errorMsg

Upload.tsx (完成逻辑)
  ├── 触发: 所有 source 处理完毕
  └── 响应: router.replace 回到数据集详情页 currentTab=collectionCard
```

### `/core/dataset/collection/create/images` 调用链

```
FileLocal.tsx (SelectFile → onSelectFiles)
  ├── 触发: 上传的文件列表中包含图片文件（.jpg/.jpeg/.png）
  ├── 参数: { parentId, datasetId, collectionName, files, fileMd5, onUploadProgress }
  ├── 并行: 与文档文件的 S3 上传并行执行
  └── 响应处理: 进度回调 → 图片文件标记 dbFileId='image_dataset' 以便后续步骤跳过

ImageDataset.tsx (SelectFile 子组件)
  ├── 触发: 用户选择图片、填写名称后点击提交
  ├── 参数: 同上结构
  └── 响应处理: 完成 → 自动重定向回 collectionCard
```

### `/core/dataset/apiDataset/list` 调用链

```
APIDataset.tsx (CustomAPIFileInput)
  ├── 触发: 页面加载 / 点击进入子文件夹
  ├── 参数: { datasetId, parentId, searchKey, offset, pageSize }
  └── 响应处理: 返回文件列表 → 渲染 checkbox 列表，文件夹项含 chevron 箭头可展开

APIDataset.tsx (getApiDatasetFileListExistId 配合)
  ├── 触发: 与 list 并行调用
  └── 响应: 返回已导入文件 ID 的 Set → 对应 checkbox 置灰禁用
```

### `/core/dataset/database/checkConnection` 调用链

```
ConnectDatabaseForm.tsx (FormBottomButtons)
  ├── 触发: 用户点击「测试连接」按钮
  ├── 参数: { type, host, port, database, user, password, schema, poolSize }
  └── 响应处理: 成功/失败 toast 提示
```

### `/core/dataset/database/createCollections` 调用链

```
useDataBaseConfig.ts (hook)
  ├── 触发: 用户在表配置步骤确认创建
  ├── 参数: { datasetId, tables: [{ tableName, columns, ... }] }
  ├── 分支: 新建模式调用 createCollections；编辑模式调用 applyChanges
  └── 响应处理: 成功 → 更新本地表配置状态
```
