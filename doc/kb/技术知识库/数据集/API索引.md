---
capability_label: 数据集
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: null
roles: [管理员, 协作者, 只读用户]
router_paths: [/dataset/list, /dataset/detail]
---

# 数据集 — API索引

API 定义文件：`projects/app/src/web/core/dataset/api.ts`（约 654 行），部分功能由子模块 API 文件提供（`api/collection.ts`、`api/file.ts`、`api/collaborator.ts`、`api/training.ts`）。

## 数据集 CRUD

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/list` | POST | 获取数据集列表（可分页） | `api.ts:127` → 列表页 context | 数据集→数据集列表→加载时调用；搜索/分页时调用 |
| `/core/dataset/listWithChildren` | POST | 获取数据集列表（含子节点） | `api.ts:130` → 列表页 context | 数据集→数据集列表→加载文件夹结构时调用 |
| `/core/dataset/detail` | GET | 获取数据集详情 | `api.ts:145` → `datasetPageContext.tsx:107` | 数据集→数据集详情→加载时调用；轮询同步状态时调用 |
| `/core/dataset/create` | POST | 创建新数据集 | `api.ts:147` → 创建弹窗组件 | 数据集→数据集列表→创建数据集→提交表单时调用 |
| `/core/dataset/createWithFiles` | POST | 创建数据集并上传文件 | `api.ts:150` → 创建弹窗组件 | 数据集→数据集列表→创建数据集（含文件）→提交时调用 |
| `/core/dataset/update` | PUT | 更新数据集信息 | `api.ts:153` → `datasetPageContext.tsx:116` | 数据集→数据集列表→编辑时调用；数据集详情→修改配置时调用 |
| `/core/dataset/delete` | DELETE | 删除数据集 | `api.ts:155` → 列表页 | 数据集→数据集列表→删除数据集时调用 |

## 文件夹与权限

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/folder/create` | POST | 创建数据集文件夹 | `api.ts:162` → 列表页 `EditFolderModal` | 数据集→数据集列表→创建文件夹→提交时调用 |
| `/core/dataset/paths` | GET | 获取数据集路径 | `api.ts:140` → `datasetPageContext.tsx:195` | 数据集→数据集详情→加载面包屑路径时调用 |
| `/core/dataset/getPermission` | GET | 获取数据集权限 | `api.ts:165` → ConfigPerModal | 数据集→数据集列表→打开权限配置时调用 |
| `/core/dataset/resumeInheritPermission` | PUT | 恢复权限继承 | `api.ts:168` → ConfigPerModal | 数据集→数据集列表→权限配置→恢复继承时调用 |
| `/core/dataset/apps` | GET | 获取引用了该数据集的 App 列表 | `api.ts:640` → 详情信息页 | 数据集→数据集详情→查看关联应用时调用 |

## 知识集合管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/collection/listV2` | POST | 获取知识集合列表（分页） | `api.ts:281` → CollectionCard | 数据集→数据集详情→集合Tab→加载时调用；翻页/搜索时调用 |
| `/core/dataset/collection/detail` | GET | 获取集合详情 | `api.ts:285` → NavBar / DataCard | 数据集→数据集详情→进入数据卡片时调用 |
| `/core/dataset/collection/paths` | GET | 获取集合路径 | `api.ts:283` → NavBar | 数据集→数据集详情→导航栏加载面包屑时调用 |
| `/core/dataset/collection/create` | POST | 创建集合 | `api.ts:291` → 多种导入组件 | 数据集→数据集详情→导入→创建集合时调用 |
| `/core/dataset/collection/create/fileId` | POST | 通过文件创建集合 | `api.ts:293` → Import 组件 | 数据集→数据集详情→导入→上传文件→创建集合时调用 |
| `/core/dataset/collection/create/link` | POST | 通过链接创建集合 | `api.ts:301` → Import 组件 | 数据集→数据集详情→导入→链接导入时调用 |
| `/core/dataset/collection/create/text` | POST | 通过文本创建集合 | `api.ts:334` → Import 组件 | 数据集→数据集详情→导入→文本导入时调用 |
| `/core/dataset/collection/create/apiCollectionV2` | POST | 通过 API 数据源创建集合 | `api.ts:343` → Import 组件 | 数据集→数据集详情→导入→API数据源→创建时调用 |
| `/core/dataset/collection/create/custom/fileId` | POST | 综合文件创建集合 | `api.ts:308` → Import 组件 | 数据集→数据集详情→导入→综合文件上传时调用 |
| `/core/dataset/collection/create/custom/link` | POST | 静态网页创建集合 | `api.ts:319` → Import 组件 | 数据集→数据集详情→导入→网页链接时调用 |
| `/core/dataset/collection/create/custom/website` | POST | 批量爬取网站创建集合 | `api.ts:329` → Import 组件 | 数据集→数据集详情→导入→批量网页时调用 |
| `/core/dataset/collection/create/reTrainingCollection` | POST | 重新训练文件集合 | `api.ts:297` → 集合重组 | 数据集→数据集详情→集合→重新训练时调用 |
| `/core/dataset/collection/create/backup` | POST | 备份导入集合 | `api.ts:174` → BackupImportModal | 数据集→数据集详情→集合→备份导入时调用 |
| `/core/dataset/collection/create/template` | POST | 模板导入集合 | `api.ts:203` → TemplateImportModal | 数据集→数据集详情→集合→模板导入时调用 |
| `/core/dataset/collection/update` | POST | 更新集合 | `api.ts:350` → 集合编辑组件 | 数据集→数据集详情→集合→编辑时调用 |
| `/core/dataset/collection/delete` | POST | 删除集合 | `api.ts:352` → 集合列表 | 数据集→数据集详情→集合→删除时调用 |
| `/core/dataset/collection/sync` | POST | 同步链接集合 | `api.ts:354` → 集合列表 | 数据集→数据集详情→集合→同步外部链接时调用 |
| `/core/dataset/collection/trainingDetail` | GET | 获取集合训练详情 | `api.ts:287` → 集合组件 | 数据集→数据集详情→查看训练详情时调用 |
| `/core/dataset/collection/check/duplicate` | POST | 检查文件名重复 | `api.ts:362` → 导入组件 | 数据集→数据集详情→导入→上传前检查重名时调用 |
| `/core/dataset/collection/check/md5Duplicate` | POST | 检查 MD5 重复 | `api.ts:368` → 导入组件 | 数据集→数据集详情→导入→上传前检查内容重复时调用 |

## 数据操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/data/v2/list` | POST | 获取数据列表（分页） | `api.ts:402` → DataCard | 数据集→数据集详情→数据卡片→加载时调用 |
| `/core/dataset/data/detail` | GET | 获取数据详情 | `api.ts:413` → DataCard/编辑弹窗 | 数据集→数据集详情→数据卡片→查看/编辑数据时调用 |
| `/core/dataset/data/insertData` | POST | 插入一条数据 | `api.ts:419` → DataCard | 数据集→数据集详情→数据卡片→新增数据时调用 |
| `/core/dataset/data/update` | PUT | 更新数据 | `api.ts:425` → DataCard | 数据集→数据集详情→数据卡片→编辑数据时调用 |
| `/core/dataset/data/delete` | DELETE | 删除数据 | `api.ts:430` → DataCard | 数据集→数据集详情→数据卡片→删除数据时调用 |
| `/core/dataset/data/getQuoteData` | POST | 获取引用数据 | `api.ts:434` → 引用组件 | 对话模块→引用展示→获取原始数据时调用 |
| `/core/dataset/data/getPermission` | GET | 获取数据权限 | `api.ts:405` → 权限相关 | 数据集→数据卡片→查看数据权限时调用 |
| `/core/dataset/data/getBatchPermission` | POST | 批量获取数据权限 | `api.ts:408` → 批量操作 | 数据集→数据卡片→批量操作时调用 |
| `/core/dataset/data/getindex` | POST | 获取数据在集合中的位置 | `api.ts:442` → DataCard | 数据集→数据集详情→数据卡片→定位数据位置时调用 |

## 标签管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/dataset/tag/list` | POST | 获取标签列表 | `api.ts:386` → HeaderTagPopOver | 数据集→数据集详情→集合→标签筛选时调用 |
| `/proApi/core/dataset/tag/create` | POST | 创建标签 | `api.ts:373` → TagManageModal | 数据集→数据集详情→集合→创建新标签时调用 |
| `/proApi/core/dataset/tag/update` | POST | 更新标签 | `api.ts:379` → TagManageModal | 数据集→数据集详情→集合→编辑标签时调用 |
| `/proApi/core/dataset/tag/delete` | DELETE | 删除标签 | `api.ts:377` → TagManageModal | 数据集→数据集详情→集合→删除标签时调用 |
| `/proApi/core/dataset/tag/getAllTags` | GET | 获取全部标签 | `api.ts:389` → `datasetPageContext.tsx:145` | 数据集→数据集详情→加载时获取所有标签 |
| `/proApi/core/dataset/tag/tagUsage` | GET | 获取标签使用统计 | `api.ts:387` → 标签组件 | 数据集→数据集详情→查看标签使用情况时调用 |
| `/proApi/core/dataset/tag/addToCollections` | POST | 添加标签到集合 | `api.ts:375` → 集合操作 | 数据集→数据集详情→集合→批量添加标签时调用 |
| `/proApi/core/dataset/tag/setCollectionTags` | POST | 设置集合标签 | `api.ts:391` → TagsPopOver | 数据集→数据集详情→集合→为集合设置标签时调用 |
| `/proApi/core/dataset/tag/batchSetCollectionTags` | POST | 批量设置集合标签 | `api.ts:393` → 批量操作 | 数据集→数据集详情→集合→批量设置标签时调用 |
| `/proApi/core/dataset/tag/batchUpsert` | POST | 批量创建/更新标签 | `api.ts:395` → 批量操作 | 数据集→数据集详情→集合→批量导入标签时调用 |

## 训练与向量化

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/training/rebuildEmbedding` | POST | 重建向量嵌入 | `api.ts:449` → 集合组件 | 数据集→数据集详情→集合→重建向量时调用 |
| `/core/dataset/training/getDatasetTrainingQueue` | GET | 获取训练队列状态 | `api.ts:452` → `datasetPageContext.tsx:190` | 数据集→数据集详情→轮询训练/重建进度时调用 |
| `/core/dataset/training/deleteTrainingData` | POST | 删除训练数据 | `api.ts:463` → 训练管理 | 数据集→数据集详情→训练管理→删除训练数据时调用 |
| `/core/dataset/training/updateTrainingData` | PUT | 更新训练数据 | `api.ts:465` → 训练管理 | 数据集→数据集详情→训练管理→修改训练数据时调用 |
| `/core/dataset/training/retryErrorCollections` | PUT | 重试失败集合 | `api.ts:467` → 集合组件 | 数据集→数据集详情→集合→重试失败训练时调用 |
| `/core/dataset/training/getTrainingDataDetail` | POST | 获取训练数据详情 | `api.ts:469` → 训练管理 | 数据集→数据集详情→查看训练数据详情时调用 |
| `/core/dataset/training/getTrainingError` | POST | 获取训练错误信息 | `api.ts:471` → 训练管理 | 数据集→数据集详情→查看训练错误详情时调用 |
| `/core/dataset/file/getPreviewChunks` | POST | 获取预览分块 | `api.ts:457` → 导入组件 | 数据集→数据集详情→导入→预览文件分块效果时调用 |

## 搜索测试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/searchTest` | POST | 搜索测试 | `api.ts:277` → Test 组件 | 数据集→数据集详情→搜索测试Tab→执行搜索时调用 |

## 同义词管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/synonym/upload` | POST | 上传同义词文件 | `api.ts:584` → Synonym 组件 | 数据集→数据集详情→同义词Tab→上传文件时调用 |
| `/core/dataset/synonym/list` | GET | 获取同义词文件列表 | `api.ts:618` → Synonym 组件 | 数据集→数据集详情→同义词Tab→加载列表时调用 |
| `/core/dataset/synonym/download` | GET | 下载同义词文件 | `api.ts:626` → Synonym 组件 | 数据集→数据集详情→同义词Tab→下载文件时调用 |
| `/core/dataset/synonym/delete` | DELETE | 删除同义词文件 | `api.ts:635` → Synonym 组件 | 数据集→数据集详情→同义词Tab→删除文件时调用 |

## 数据库知识库

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/database/checkConnection` | POST | 测试数据库连接 | `api.ts:534` → ConnectDatabaseForm | 数据集→数据集详情→导入→数据库→连接测试时调用 |
| `/core/dataset/database/getConfiguration` | GET | 获取数据库配置 | `api.ts:525` → DataBaseConfig | 数据集→数据集详情→导入→数据库→获取配置时调用 |
| `/core/dataset/database/preview` | GET | 预览数据库数据 | `api.ts:576` → FileDataCard / 导入 | 数据集→数据集详情→预览数据库数据时调用 |
| `/core/dataset/database/detectChanges` | POST | 检测数据变更 | `api.ts:508` → 数据库配置 | 数据集→数据集详情→检测数据源变更时调用 |
| `/core/dataset/database/applyChanges` | POST | 应用数据变更 | `api.ts:502` → 数据库配置 | 数据集→数据集详情→数据库→应用变更时调用 |
| `/core/dataset/database/createCollections` | POST | 创建数据库集合 | `api.ts:518` → 导入组件 | 数据集→数据集详情→导入→数据库→创建时调用 |
| `/core/dataset/database/createStructureCollection` | POST | 创建结构化文档集合 | `api.ts:541` → 导入组件 | 数据集→数据集详情→导入→结构化文档→创建时调用 |
| `/core/dataset/database/searchTest` | POST | 数据库搜索测试 | `api.ts:490` → Test 组件 | 数据集→数据集详情→搜索测试Tab→数据库搜索时调用 |

## API 数据集

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/dataset/apiDataset/list` | POST | 获取 API 数据集文件列表 | `api.ts:475` → Import 组件 | 数据集→数据集详情→导入→API数据源→浏览文件时调用 |
| `/core/dataset/apiDataset/listExistId` | GET | 获取已有 API 数据集文件 ID | `api.ts:477` → Import 组件 | 数据集→数据集详情→导入→API数据源→增量同步时调用 |
| `/core/dataset/apiDataset/getCatalog` | POST | 获取 API 数据集目录 | `api.ts:480` → Import 组件 | 数据集→数据集详情→导入→API数据源→浏览目录时调用 |
| `/core/dataset/apiDataset/getPathNames` | POST | 获取 API 数据集路径名 | `api.ts:483` → Import 组件 | 数据集→数据集详情→导入→API数据源→获取路径时调用 |

## 外部数据集同步

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/dataset/datasetSync` | POST | 同步外部数据集 | `api.ts:157` → 数据集组件 | 数据集→数据集详情→同步外部数据源时调用 |
| `/proApi/core/dataset/collection/create/externalFileUrl` | POST | 通过外部文件 URL 创建集合 | `api.ts:337` → Import 组件 | 数据集→数据集详情→导入→外部文件→创建时调用 |

## 协作者管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/proApi/core/dataset/changeOwner` | POST | 更改数据集所有者 | `api.ts:171` → ConfigPerModal | 数据集→数据集列表→权限配置→变更所有者时调用 |
| 协作者相关 API | POST/GET/DELETE | 管理数据集协作者 | `api/collaborator.ts` → ConfigPerModal | 数据集→数据集列表→权限配置→管理协作者时调用 |

## 文件管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 文件上传预签名 URL | POST | 获取数据集文件上传 URL | `api/file.ts` → 导入组件 | 数据集→数据集详情→导入→上传文件→获取上传地址时调用 |
