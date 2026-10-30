# MongoDB 向量 provider 与 PG 数据迁移

## 连接与存储

- `EMBEDDING_MONGO_URL` 单独指定向量数据库，优先级高于现有 vector provider；留空保持原选择逻辑。
- 集合固定为 `dataset_data_embeddings`，普通索引通过 `defineIndex` 声明。这是新集合，没有已确认需要废弃的 FastGPT 历史索引。
- `_id` 为字符串，与业务库 `dataset_datas.indexes.dataId` 保持一致。PG 迁移保留十进制主键，新向量使用 24 位 ObjectId 字符串，避免与旧 ID 冲突。
- `teamId`、`datasetId`、`collectionId` 使用字符串，与统一 vector provider 契约及现有 PG 字段一致。
- 原始 1536 维向量保留在 MongoDB；`embedding_int8` 搜索索引使用 `quantization: scalar` 自动执行 INT8 量化，原始向量不做有损改写。
- MongoDB 向量连接独立于业务库连接，支持同集群不同数据库及独立集群。

## 检索与运行行为

- 使用 HNSW + dotProduct + INT8 召回两倍候选，再在 MongoDB 聚合中用原始向量精确计算内积、排序和截断，保持现有相似度阈值语义。实际旧数据验证发现少数向量的 INT8 分数有较大偏差，因此不能仅将量化分数反变换后直接返回。用户以约 95% 召回重合为目标；20 组实际查询原生 INT8 约 93.5%，两倍候选约 97.3%，五倍候选 100%，采用两倍方案。
- MongoDB dotProduct 要求单位向量；写入和查询检查维度、有限数及单位长度，允许 1% 的低精度舍入误差，不自动改变向量。非归一化模型应启用模型 normalization 配置。
- 召回前强制应用团队、知识库、集合允许/禁止列表；空知识库或空可读集合范围直接返回空结果。
- 初始化补建普通索引，验证本 provider 命名搜索索引的配置并等待 READY。错误直接阻止初始化，不回退到其他向量库。
- 插入、删除、计数、时间范围扫描、旧向量时间刷新实现完整 provider 契约；全文检索继续使用既有 MongoDB 全文存储。

## 显式 PG 迁移

命令位于 `projects/app`：

```sh
pnpm migrate:pg-to-mongo-embeddings -- --dry-run
pnpm migrate:pg-to-mongo-embeddings -- --execute
```

需要 `PG_URL`、`EMBEDDING_MONGO_URL`。命令自动加载 App 的 `.env.local`、`.env`；外部环境变量优先。

- 本次为显式切换存储的一次性迁移，不注册为所有部署自动执行的系统升级任务。
- 停止本地 dev 写入后执行迁移；PG 使用 repeatable-read 快照和 SHARE 锁阻止复制期间的源表变更。
- 按 PG 主键递增分页，整批校验后执行 `$setOnInsert`。失败后重跑整个脚本，已完成批次无需覆盖即可复用。
- 逐条核对 ID、归属、创建时间、原始向量每一维及可选文本。目标已存在同 ID 且内容不一致时失败，不覆盖业务数据。
- PG 无时区时间戳显式按源数据库连接的 `TimeZone` 转换，避免脚本所在机器的时区影响迁移。
- 最终扫描数、源表总数和目标 PG ID 总数必须相等；源 PG 表始终保留。
- 完成后等待检索可见，比较 PG 与 MongoDB 召回、权限过滤、相似度分数，再更新本地 `.env.local` 并验证真实应用读写。

## 验收 TODO

- [x] provider 局部测试及迁移边界测试
- [x] 类型检查、相关格式与静态检查
- [x] PG 数据 dry-run、正式导入、重复执行和逐条一致性验证（15,859 条，重复执行新增 0 条）
- [x] INT8 索引 READY 与召回对比（20 组查询，两倍候选 Recall@10 约 97.3%）
- [x] 本地 dev 切换后的真实查询、向量写入及删除验证（新建测试知识库与文本，确认 2 条新向量写 MongoDB，PG 数量保持不变，删除后清理成功）
