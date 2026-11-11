# T02：`dataset` 知识库域全链路命令

- **所属需求包**：`PKG-03` 知识库 RAG 全链路（Record: `reczz28YGuG6QfA7`）
- **覆盖 FR**：`FR-301` dataset CRUD/检索/导出、`FR-302` collection 导入/重训、`FR-303` data 分块管理、`FR-304` train 队列与轮询、`FR-305` tag 与 synonym
- **阶段 / 优先级**：Phase 1 · P1（高频主力域）
- **状态**：待前置 T00（PRD Record: `reczz28YDq8uS2GJ` · [飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要 multipart 上传、文件下载、确认门禁、`--dry-run`、分页与文本列表渲染）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T01、T03 ~ T10 完全并行

---

## 1. 目标

实现 FastGPT 知识库全链路 CLI 管理能力：创建/检索知识库、导入本地文件/文本/网页链接创建集合、查询或重试训练队列、增删改分块数据、管理标签与同义词。

---

## 2. 命令设计与接口映射

> 开发前请逐一核对 `projects/app/src/pages/api/core/dataset/**` 的 HTTP Method 与 `authDataset` / `authDatasetCollectionCreate` 是否开启 `authApiKey: true`（注意部分 `/proApi/**` 与管理接口仅支持 `token`）。

### 2.1 `dataset` 主资源

| 命令 | 对应服务端接口 | 风险 | 默认 `authModes` | 说明 |
|---|---|---|---|---|
| `dataset list` | `/core/dataset/listV2` | `read` | `['token', 'personalKey']` | 支持 `--parent-id`、`--type`、`--search`、分页参数 |
| `dataset get <datasetId>` | `/core/dataset/detail` | `read` | `['token', 'personalKey']` | 获取知识库详情与向量/文本模型配置 |
| `dataset create` | `/core/dataset/create` | `write` | `['token', 'personalKey']` | 支持 `--name`、`--type`、`--vector-model`、`--agent-model`、`--parent-id`、`--file`、`--dry-run` |
| `dataset update <datasetId>` | `/core/dataset/update` | `write` | `['token', 'personalKey']` | 更新名称/简介/模型配置（核对路由 auth） |
| `dataset delete <datasetId>` | `/core/dataset/delete` | `destructive` | `['token', 'personalKey']` | 必须二次确认 / 非 TTY `--yes`（核对路由 auth） |
| `dataset search <datasetId> <text>` | `/core/dataset/searchTest` | `read` | `['token', 'personalKey']` | 召回测试，支持 `--limit`、`--similarity`、`--search-mode`、`--using-rerank` |
| `dataset sync <datasetId>` | `/proApi/core/dataset/datasetSync` | `write` | 核对路由后确定 | 触发 API 知识库全量同步（Pro） |
| `dataset export <datasetId>` | `/core/dataset/exportAll` | `read` | 核对路由后确定 | 流式导出落盘 `--output <path>` |

### 2.2 `dataset collection` 集合管理

| 命令 | 对应服务端接口 | 风险 | 说明 |
|---|---|---|---|
| `dataset collection list <datasetId>` | `/core/dataset/collection/listV2` | `read` | 支持 `--parent-id`、`--search`、分页 |
| `dataset collection get <collectionId>` | `/core/dataset/collection/detail` | `read` | 集合详情与分块配置 |
| `dataset collection create-text <datasetId>` | `/core/dataset/collection/create/text` | `write` | 从 `--name` + `--text` / `--file` / `--stdin` 导入文本 |
| `dataset collection create-link <datasetId>` | `/core/dataset/collection/create/link` | `write` | 从 `--link <url>` 抓取网页建集合 |
| `dataset collection create-file <datasetId> <filePath>` | `/core/dataset/collection/create/localFile` 或 presign + `create/fileId` | `write` | 上传本地文件建集合（见 3.1 上传约束） |
| `dataset collection update <collectionId>` | `/core/dataset/collection/update` | `write` | 修改名称/标签/权限（支持 `--dry-run`） |
| `dataset collection delete <collectionId>` | `/core/dataset/collection/delete` | `destructive` | 删除集合（需确认 / `--yes`） |
| `dataset collection read <collectionId>` | `/core/dataset/collection/read` | `read` | 读取原文档读取链接/内容 |
| `dataset collection export <collectionId>` | `/core/dataset/collection/export` | `read` | 导出 CSV 到 `--output <path>` |
| `dataset collection sync <collectionId>` | `/core/dataset/collection/sync` | `write` | 重同步外部链接集合 |
| `dataset collection retrain <collectionId>` | `/core/dataset/collection/create/reTrainingCollection` | `write` | 以新分块参数重建训练 |

### 2.3 `dataset data`、`dataset train`、`dataset tag`、`dataset synonym`

- `dataset data`:
  - `list <collectionId>` (`/core/dataset/data/v2/list`)
  - `get <dataId>` (`/core/dataset/data/detail`)
  - `insert` (`/core/dataset/data/insertData` & 批量 `/core/dataset/data/pushData`，支持 `--file` / `--stdin`)
  - `update <dataId>` (`/core/dataset/data/update`)
  - `delete <dataId>` (`/core/dataset/data/delete`, `destructive`)
- `dataset train`:
  - `queue <datasetId>` (`/core/dataset/training/getDatasetTrainingQueue`)
  - `errors <datasetId>` (`/core/dataset/training/getDatasetTrainingError` & `/core/dataset/training/getTrainingError`)
  - `retry <datasetId>` (`/core/dataset/training/rebuildEmbedding`, `write`)
  - `wait <datasetId>`（CLI 客户端编排：轮询 `trainingDetail` / `getDatasetTrainingQueue` 直到训练队列清空或超时，仅将状态变化输出至 `stderr`）
- `dataset tag`（Pro）：`list` / `create` / `update` / `delete` / `bind`（`/proApi/core/dataset/tag/*`）
- `dataset synonym`：`list` / `upload` / `update` / `delete` / `download`（`/core/dataset/synonym/*`）

---

## 3. 核心实现要点与限制

### 3.1 文件上传双通道约束
- 首选使用 `uploadMultipart` 调 `/core/dataset/collection/create/localFile`（`file` 为文件 Blob，`data` 为 JSON 序列化字符串），兼容 OpenAPI `SystemOpenApiTagMap.datasetCollectionCreate`（`token` 与 `personalKey` 均可）。
- 若需大文件/S3 预签名上传（`presignDatasetFilePostUrl` -> S3 PUT -> `create/fileId`），**S3 PUT 请求不得向外部 S3 URL 附加 FastGPT 的 `token` / `Authorization` 凭据头**，防止密钥泄露给第三方对象存储！

### 3.2 目录与文件落点
- `src/domain/dataset/dataset-service.ts`
- `src/domain/dataset/collection-service.ts`
- `src/domain/dataset/data-service.ts`
- `src/domain/dataset/training-service.ts`
- `src/cli/commands/dataset/*.ts`（拆分为 `dataset.ts`、`collection.ts`、`data.ts`、`train.ts`、`tag-synonym.ts`）

### 3.3 非目标
- 不在本任务实现浏览器/图像预览 UI；`getPreviewChunks` 可作为后续小扩展或配合 `--preview` 参数。

---

## 4. 验收标准与测试清单

- [ ] Mock 单测覆盖：知识库创建/搜索/删除、`create-text`/`create-file` multipart 格式校验、`train wait` 轮询退出条件、`authModes` 拦截 `appKey`。
- [ ] 覆盖 `destructive` 护栏测试（`dataset delete` / `collection delete` / `data delete` 非 TTY 缺 `--yes` 返回退出码 `2`）。
- [ ] `--dry-run` 不发送请求且返回完整脱敏请求预览。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
