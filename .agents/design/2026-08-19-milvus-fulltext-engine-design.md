# Milvus 全文检索最终设计

> 状态：已实现
>
> 最后校准：2026-08-29
>
> 事实来源：当前代码

## 1. 目标与结论

FastGPT 的全文检索引擎跟随实际向量库，不提供独立开关：

| 实际向量库 | 向量存储 | 全文存储与检索 |
|---|---|---|
| Milvus | Milvus `modeldata_v2` | 同表 `text` + BM25 `sparse` |
| PG、OceanBase、SeekDB、OpenGauss | 各自的 `modeldata` | MongoDB `dataset_data_texts` + `$text` |

Milvus 采用单表方案：一条 `indexes[]` 索引对应 `modeldata_v2` 中一行，稠密向量和全文文本共同写入。`dataset_data` 仍是业务主数据，向量与全文均为可重建的派生数据。

核心约束：

- Milvus 主表固定为 `modeldata_v2`，正常运行不访问旧 `modeldata`。
- 全文粒度固定为 `indexes[].text`，不使用整条 Q/A 作为 Milvus 全文粒度。
- 图片向量仍写入，但 `imageEmbedding` 的 `text` 固定为空，避免索引图片 URL 或对象存储 Key。
- Milvus 最低版本为 `2.5.16`，启动时强校验版本和 BM25 集合能力，不支持则启动失败，不做运行时降级。
- 旧 `modeldata` 只作为迁移源；迁移完成后默认 release，只有显式传入 `removeOld=1` 才删除。

## 2. 存储模型

### 2.1 集合选择

`getDatasetVectorTableName()` 是向量表名的唯一解析入口：

```text
provider = milvus  -> modeldata_v2
其他 provider      -> modeldata
```

Milvus 初始化只创建、加载和校验 `modeldata_v2`。旧 `modeldata` 不参与正常初始化、查询、统计或写入。

### 2.2 `modeldata_v2` Schema

| 字段 | 类型 | 语义 |
|---|---|---|
| `id` | Int64，主键 | 向量 ID，与 `dataset_data.indexes[].dataId` 一一对应 |
| `vector` | FloatVector，1536 维 | 稠密向量 |
| `text` | VarChar(65535) | BM25 输入，等于对应的 `indexes[].text` |
| `sparse` | SparseFloatVector | 由 BM25 Function 从 `text` 自动生成 |
| `createTime` | Int64 | 写入时间戳，用于按时间扫描和清理 |
| `teamId` | VarChar(64) | 团队过滤 |
| `datasetId` | VarChar(64) | 知识库过滤 |
| `collectionId` | VarChar(64) | 集合过滤 |

表中不冗余 `dataId`。检索或清理需要业务数据 ID 时，通过向量主键反查 `dataset_data.indexes[].dataId`。

BM25 Function 固定为：

```text
text --BM25--> sparse
```

索引配置：

| 字段 | 索引 |
|---|---|
| `vector` | HNSW，IP，`M=32`，`efConstruction=128` |
| `sparse` | `SPARSE_INVERTED_INDEX`，BM25，`k1=1.2`，`b=0.75` |
| `createTime` | `STL_SORT` |
| `teamId`、`datasetId`、`collectionId` | `Trie` |

文本按 UTF-8 字节截断，写入上限为 65535 字节，查询上限为 4000 字节，保证不会截断代理对或产生非法字符串。

### 2.3 Analyzer

环境变量：

| 变量 | 可选值 | 默认值 |
|---|---|---|
| `MILVUS_LANGUAGE_IDENTIFIER` | `lingua`、`whatlang` | `lingua` |

统一使用 Milvus `language_identifier` tokenizer：英文使用 `english` analyzer，其他语言默认使用 `standard`。中文映射必须与识别器返回值一致：

- `lingua`：`Chinese -> jieba`
- `whatlang`：`Mandarin -> jieba`

非法环境变量值会在配置解析阶段报错。

## 3. 读写链路

### 3.1 写入与更新

向量控制器的 `texts` 与 `vectors` 一一对应：

- Milvus 要求 `texts` 必须存在且长度与 `vectors` 完全相同；缺失或错位直接报错。
- 非 Milvus provider 忽略 `texts`，保持原有向量写入行为。
- Milvus 每行同时写入 `vector`、`text`、归属字段和 `createTime`，BM25 Function 自动生成 `sparse`。
- 实时写入使用 insert，新旧数据迁移使用主键 upsert；服务端返回部分失败或错误状态时必须显式抛错，不能把 resolve 当作成功。

MongoDB 全文路径通过 `FullTextStore` 写入 `dataset_data_texts`：原始 Q/A 在 Store 内使用 jieba 分词，按 `dataId` 幂等 upsert，每 50 条分片 `bulkWrite`，并透传 Mongo session。

Milvus 的 `FullTextStore.write` 和删除方法是空操作，因为全文与向量由同一行、同一向量通道维护。数据创建和更新时先生成并写入新向量，再把返回的向量 ID 保存到 `dataset_data.indexes[]`；旧向量在主数据指向新 ID 后删除。

Milvus 无法参与 MongoDB 事务，因此接受最终一致性：MongoDB 回滚或删除异常可能留下孤儿向量，但不会产生指向错误业务数据的有效命中。

### 3.2 删除与孤儿清理

删除 data、collection 或 dataset 时：

- Milvus 直接删除 `modeldata_v2` 对应行，全文随向量一起删除。
- 其他 provider 删除向量，同时在 Mongo session 内删除 `dataset_data_texts`。

系统每小时扫描 6 小时前至 2 小时前写入的向量。若 `teamId + datasetId + indexes.dataId` 在 `dataset_data` 中不存在，则按向量 ID 删除该孤儿行。`modeldata_v2` 的向量与全文同表，因此一次删除即可同时清理两类派生数据。

### 3.3 全文检索

召回层统一调用 `getFullTextStore().search()`，返回：

```ts
type FullTextSearchItem = {
  dataId: string;
  collectionId: string;
  score: number;
};
```

MongoDB 实现使用 jieba 查询词和 `$text`；Milvus 实现使用：

- `anns_field: 'sparse'`
- `metric_type: 'BM25'`
- `teamId`、`datasetId`、collection allow/forbid 条件
- 输出向量 `id` 和 `collectionId`

Milvus 表不存业务 `dataId`，所以搜索后按向量 ID 批量反查 `dataset_data.indexes[].dataId`，再按业务 `dataId` 去重并保留最高分。孤儿向量会被跳过。

一条业务数据可能对应多个向量。为避免多个向量挤占 top-K，Milvus 首轮最多取 `limit * 2` 条；若向量结果取满但去重后不足 `limit`，第二轮最多取 500 条。最终结果再统一回查 data、collection 并组装为召回结果。

## 4. 启动校验

Milvus provider 初始化顺序如下：

1. 连接 Milvus，并选择或创建 `fastgpt` database；Zilliz Cloud 不支持数据库操作时只记录 warning，继续使用当前 database。
2. 调用 `getVersion()`，要求版本不低于 `2.5.16`；获取失败、无法解析或版本过低均终止初始化。
3. 幂等创建并加载 `modeldata_v2`。
4. 通过集合元数据校验：
   - `text` 字段包含 analyzer 配置；
   - `sparse` 字段存在；
   - 存在 `text -> sparse` 的 BM25 Function；
   - `sparse_BM25` 索引存在且 metric 为 BM25。

任何能力校验失败都直接抛错。运行期间不探测版本，也不回退到 MongoDB 全文检索。

## 5. 旧数据迁移

### 5.1 入口与适用范围

管理员接口：

```text
GET /api/admin/4162/milvus
```

仅 root 管理员可调用，且实际向量库必须为 Milvus。

| Query 参数 | 默认值 | 说明 |
|---|---|---|
| `batchSize` | 500 | 源读取批大小，范围 1～2000 |
| `dryRun` | false | 只校验并统计源数据，不写目标表 |
| `removeOld` | false | 成功后删除旧 `modeldata`，并清空 `dataset_data_texts` |
| `resumeMigrationId` | 无 | 从已有迁移日志的 cursor 续跑 |

迁移不是“从 MongoDB 重建向量”，而是合并两个数据源：

```text
旧 Milvus modeldata：id + vector + 归属 + createTime
MongoDB dataset_data：按 indexes.dataId 取得 indexes[].text 和业务归属
                              |
                              v
新 Milvus modeldata_v2：vector + text + sparse + 归属
```

如果旧 `modeldata` 不存在或为空，说明已经没有可复制的向量，接口立即报错。此时必须调用 `POST /api/core/dataset/training/rebuildEmbedding` 从 `dataset_data` 重新生成嵌入。

### 5.2 执行与完成条件

迁移按旧表主键递增遍历，目标按 50 行分片 upsert：

- MongoDB 中找不到对应 index 的源行视为孤儿并跳过。
- `imageEmbedding` 保留向量，但写入空全文。
- 每批写入后持久化 cursor 和成功、跳过、失败计数。
- Milvus 返回的部分失败会按向量 ID 写入失败表；主循环结束后再次回源并批量自愈。
- 最终先确保 `modeldata_v2` 已加载，再 flush 并读取目标实际行数。

只有同时满足以下条件才算完成：

```text
failedCount = 0
processedCount + skippedCount = sourceCount
targetCount >= processedCount
```

成功后 release 旧 `modeldata`。`removeOld=1` 时再显式 drop 旧表并清空 MongoDB `dataset_data_texts`；删除旧表后若需回滚，只能从备份恢复或重新嵌入。

### 5.3 进度、并发和取消

迁移状态保存在两个 MongoDB 集合：

- `full_text_migration_logs`：`migrationId`、状态、cursor、总量和各类计数。
- `full_text_migration_failed`：按 `migrationId + dataId` 唯一记录失败行和错误。

状态为 `running | done | failed | cancelled`。同一引擎只允许一个 `running` 迁移，由唯一部分索引兜底，避免并发双跑。

客户端断开连接会设置取消信号，任务在当前批结束后标记为 `cancelled`，不执行自愈、计数验收和旧表 release。`failed`、`cancelled` 或超过 2 分钟未更新的僵死 `running` 任务可使用原 `migrationId` 续跑；已完成任务不可续跑。

迁移目标使用主键 upsert，所以批次重试和 cursor 回退不会产生重复数据。建议先部署新代码、让实时流量写入 `modeldata_v2`，再在低写入时段迁移旧表；迁移完成条件会拦截源数据变化导致的计数缺口。

## 6. 一致性、兼容与回滚

| 场景 | 最终行为 |
|---|---|
| Milvus 写入失败 | 向量与全文同批失败，数据写入流程报错 |
| MongoDB 事务回滚后残留 Milvus 行 | 召回反查时跳过，定时任务后续清理 |
| 删除 Milvus 行失败 | 重试后仍失败则留下孤儿，召回跳过并由定时任务清理 |
| 重复写入或迁移重试 | 向量 ID/主键保证幂等或由后续清理收敛 |
| 切换到非 Milvus provider | 向量使用新 provider，全文重新走 MongoDB `$text` |
| 保留旧 `modeldata` | 可作为迁移前向量数据的回滚来源 |
| `removeOld=1` 后回滚 | 必须从备份恢复或执行 `rebuildEmbedding` |

该方案不支持把非 Milvus 向量库中的 dense 向量直接迁移到 Milvus，也不兼容曾经自行修改过 schema 的旧实验分支集合；这两类场景统一通过重新嵌入或部署方专项迁移处理。

## 7. 验证基线

代码测试覆盖以下边界：

- provider 到表名和全文 Store 的选择；
- `lingua` / `whatlang` analyzer 映射和环境变量校验；
- Milvus 版本、BM25 Function、analyzer、sparse index 能力门禁；
- `modeldata_v2` 创建、向量与全文同写、文本字节截断、图片空全文；
- dense 与 BM25 检索字段、过滤条件、反查和去重 over-fetch；
- MongoDB 全文写删及 session 透传；
- Milvus 删除 filter 和孤儿清理；
- 迁移 dry-run、幂等、断点续跑、并发拒绝、客户端取消、失败自愈、计数验收、release/drop；
- 真实 Milvus 环境下的 BM25 集成检索。

已有英文 FAQ 基准（3 万条 data、200 万条 index、268 条查询）结果：

| 指标 | MongoDB | Milvus BM25 | 提升 |
|---|---:|---:|---:|
| Hit@1 | 23.51% | 42.54% | +19.03pp |
| Hit@10 | 57.46% | 74.63% | +17.17pp |
| Hit@50 | 62.31% | 81.34% | +19.03pp |
