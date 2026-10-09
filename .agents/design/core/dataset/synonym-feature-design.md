# 知识库同义词能力设计

## 1. 目标与范围

本期只建设知识库同义词能力：管理员为单个知识库维护标准词与同义词映射，搜索和新写入数据立即使用最新规则，已有数据复用模型切换已有的 `dataset_trainings` 编排逐步重建。

本期接受重建期间新旧 embedding 混合和召回短暂不一致，只要求最终一致。索引重建和同义词重建使用独立 training mode 和 Worker，沿用现有队列租约、重试与错误处理，不新增 MQ job、operation saga 或自动回退。

能力由服务端环境变量 `DATASET_SYNONYM_ENABLED` 控制，默认关闭。关闭时管理 API 直接拒绝请求，搜索和数据写入链路不读取同义词配置、不构建 matcher，也不执行同义词转换；已存在的同义词 training 暂停领取，重新启用后继续处理。

## 2. 核心语义

### 2.1 映射规则

每组 mapping 包含一个 `standardizedTerm` 和至少一个 `synonymTerm`。匹配时统一 ASCII 大小写并保留原始 Unicode 语义，替换结果严格使用用户提交的标准词及其大小写。

任意规范化后的词只能属于一个 mapping，禁止跨组冲突、级联和闭环。JSON 与文件上传使用相同的规范化、空白、长度、数量和冲突校验。

### 2.2 生效与最终一致

上传、更新或删除在一个 MongoDB 事务中完成以下操作：

1. 写入完整的新 mapping 版本；
2. CAS 切换配置的当前版本；
3. 删除非当前版本 mapping；
4. 将版本不同且已完成索引或重建失败的数据标成 `rebuildSynonymPending`，清除旧错误和领取标记；
5. 原子领取有限数量 data，改成 `rebuildSynonymRunning` 并创建 `rebuildSynonym` 种子 training。

事务提交后新 matcher 立即用于搜索和新写入。同义词 Worker 根据 `indexStatus=rebuildSynonymPending` 持续领取任务，执行前补充下一条。待处理状态与种子任务和词表在同一事务提交；进程退出后现有 training 和租约继续续接。整个重建期间禁止再次修改词表。

数据写入使用短 TTL、支持空结果的请求合并缓存生成转换快照，避免批量导入的每个 chunk 重复读取相同配置。缓存不参与最终一致性判断：向量和全文派生数据写入完成后，仍直查 MongoDB 校验当前配置版本；不一致时回滚 Mongo 事务并清理新向量。因此其他进程切换配置不会被本地缓存掩盖。

mapping 继续使用 `fileVersion`，因为一个 matcher 由多条 Mongo 文档组成，需要版本键保证读到完整快照。系统不保留历史版本，也没有 active/pending 双版本状态。

### 2.3 原文与搜索

MongoDB 中 q、a 和 indexes.text 始终保存原文。同义词转换只用于 embedding 输入和全文检索派生文本。

搜索 query 命中同义词时始终保留原词并追加标准词。这样不需要为搜索维护专用重建状态，也能覆盖规则刚切换后的新旧 embedding 混合阶段以及多知识库规则不一致场景。

## 3. 数据结构

### 3.1 dataset_synonyms

每个知识库最多一条配置：

```ts
type DatasetSynonymConfig = {
  teamId: ObjectId;
  datasetId: ObjectId;
  fileName?: string;
  size?: number;
  uploadTime?: Date;
  uploaderId?: ObjectId;
  version: number;
  enabled: boolean;
  schemaVersion: 2;
  updateTime: Date;
};
```

`version` 是当前完整 mapping 快照的版本，同时用于 API 乐观并发校验。配置不保存 `mutationId`、claim、pending version 或专用 rebuild 状态。

### 3.2 dataset_synonym_mappings

mapping 使用 `teamId + datasetId + fileVersion` 归属配置版本，保存标准词、规范化匹配键、同义词列表、管理检索文本和 fingerprint。

在线更新在事务中写入下一版本并删除旧版本，因此运行时只读取配置指向的当前完整版本。

### 3.3 dataset_datas 与 dataset_trainings

`dataset_datas.synonymVersion` 记录当前派生索引使用的配置版本，`synonymRebuildingVersion` 是领取标记；training 不保存 `synonymVersion`，以 `mode=rebuildSynonym` 表达同义词重建。`rebuildIndex` 由索引重建 Worker 消费，`rebuildSynonym` 由同义词 Worker 消费。

规则变化后，种子任务和后续链式任务持续领取 `rebuildSynonymPending` data。同义词重建和模型切换分别创建 `rebuildSynonym` / `rebuildIndex` 阶段，共用底层索引写入能力，以 `data.indexes` 的已存类型和原文重新生成向量，不读取 q/a、不重新分块，也不进入 `imageParse`、`image` 或 `auto`。图片向量只使用已存 `imageEmbedding` 索引，目标模型不支持时跳过；全文派生文本来自文本索引，图片源不进入全文检索。成功写入时更新 `synonymVersion` 并释放领取标记；失败任务保留在现有 training 重试和错误处理流程中。同义词 rebuild training 不参与普通 training 的七天 TTL，避免 MongoDB 后台删除绕过应用层 claim 清理；用户手动删除重建任务时，经额外确认后删除关联 data 及其索引。

## 4. 更新流程

上传、替换和删除共用 mutation 服务：

1. 校验知识库写权限和页面读取到的配置 ID/version。
2. 检查现有 `dataset_trainings` 和 `data.indexStatus` 的待重建/重建中状态，队列忙时禁止再次修改。
3. 创建现有训练账单。
4. 在事务中写入新 mapping、CAS 切换配置、清理旧 mapping，并按目标版本领取 data、创建受 vector worker 并发上限约束的普通种子任务。
5. 事务提交后清理当前进程 matcher cache。
6. 后续任务由同义词 Worker 按待重建状态链式补充，任务只携带 dataId 和计费归属，不携带词表版本。

删除规则使用空 mapping，并立即设置 `enabled=false`。同义词 Worker 在没有 matcher 时以原文重新生成向量和全文派生数据。

mapping 写入、配置 CAS、首批 data 领取或种子任务创建失败会回滚整个事务，不产生半套 matcher、孤立 mapping 或只有领取标记没有任务的状态。事务提交后的 worker 故障沿用现有 training 重试；删除失败任务时释放领取标记，使同版本后续领取可以重新创建任务。

## 5. Worker 与状态

两个 Worker 只领取各自 mode。`rebuildIndex` 按索引待重建状态续接；`rebuildSynonym` 按同义词待重建状态续接，并从配置读取当前版本。二者共享 embedding 并发上限和底层 indexes 重建；首次训练 `index` 单独处理正文和增强产物。重建错误只支持重试或删除，正文编辑通过 data 更新接口执行。

集合列表、详情和训练弹窗在同一次 data 聚合中，分别统计 `rebuildIndexPending/Running/Failed` 和 `rebuildSynonymPending/Running/Failed`。两类 training 均排除出普通训练聚合，避免重复计数。集合列表和详情合计 Pending + Running；训练弹窗将 Pending 计入 queuedCounts、Running 计入 trainingCounts，展示时合计 queuedCounts + trainingCounts，分别显示“索引重建 → 已就绪”和“同义词重建 → 已就绪”，统一以“N 条处理中”展示数量。新导入沿用原有配置阶段，混合模式分别展示链路，错误展示在所属模式的阶段，异常列表继续提供重试和删除。集合列表和数据页的已就绪标签不再打开弹窗；已经打开的弹窗保留本轮链路，完成后各阶段显示打勾。

旧 `mode=rebuild` 通过迁移转为 `rebuildIndex`，携带词表版本的旧重建转为 `rebuildSynonym` 并恢复关联 data 状态，清除 training 的旧版本字段。旧轮次尚未入队的数据由同义词 Worker 按版本差异逐条领取，避免迁移事务全库更新；新轮次在入口统一标记 Pending，进度包括全部未入队数据。旧节点停止后执行迁移，v1 断点升级到 v2 时重扫，重复执行不会回退新状态。

管理页的处理中状态通过现有 `dataset_trainings` 查询，不在同义词配置中维护第二份状态。重建失败继续显示在已有训练错误入口。

## 6. API 与页面

JSON 和 multipart 输入统一经过 Zod 业务 schema。API 使用 `parseApiInput` 校验请求并使用 response schema 校验业务返回。

本期提供上传、替换、删除、下载、搜索和分页 API，供后续管理页接入；现有 rebuild 队列忙时拒绝修改操作。

## 7. 数据清理

知识库删除时按既有生命周期清理配置和 mapping。同义词不注册专用 change stream 或 worker。

## 8. 验收与测试

必须覆盖：

- JSON 和文件输入的空白、冲突、大小写与限制校验；
- mapping、配置切换和首批 training 创建的事务原子性；
- 并发上传只有一个版本成功激活；
- 所有符合重建条件的历史 data 都进入同义词全量重建；
- 同义词与模型切换生成相同的 training mode 和字段；
- 上传、替换和删除后 matcher 立即生效；
- 搜索始终保留原词并追加标准词；
- 多知识库搜索、mapping 分页和静态 i18n key。

## 9. TODO

- [x] mapping、配置与首批 training 创建使用同一 MongoDB 事务。
- [x] 使用物化版本差异保证待重建 data 可恢复领取。
- [x] 复用普通 training mode，通过目标版本字段驱动同义词重建。
- [x] 同义词与模型切换使用独立 mode、Worker 和领取逻辑，共用底层索引写入。
- [x] 管理状态复用 data/training 查询。
- [x] 合并批量写入的配置快照读取，并只保留一次权威版本校验。
- [x] 增加默认关闭的服务端功能开关，关闭时跳过同义词查询和转换链路。
- [x] 将同义词 rebuild 排除出普通 training TTL，由现有重试和人工删除流程管理。
- [x] 运行定向测试、类型检查、格式检查和差异检查。
