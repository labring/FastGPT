# 知识库同义词能力设计

## 1. 目标与范围

本期只建设知识库同义词能力：管理员为单个知识库维护标准词与同义词映射，搜索和新写入数据立即使用最新规则，已有数据复用模型切换已有的 `dataset_trainings` 编排逐步重建。

本期接受重建期间新旧 embedding 混合和召回短暂不一致，只要求最终一致。不新增同义词任务类型、队列、job、operation saga、mutation lock、自动回退、专用重试或进度协议。

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
4. 按目标版本原子领取有限数量 data 并创建种子 training。

事务提交后新 matcher 立即用于搜索和新写入。普通 worker 根据 `data.synonymVersion != config.version` 持续领取和完成 rebuild，最终让全部历史向量使用当前 matcher。该版本差异是持久化恢复条件，不依赖一次性全库标记，因此进程在配置提交后退出也不会丢失待重建数据。

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

`dataset_datas.synonymVersion` 记录当前派生索引使用的配置版本，`synonymRebuildingVersion` 是领取标记；`dataset_trainings.synonymVersion` 记录任务目标版本。不增加同义词专用 mode。

规则变化后，种子任务和后续链式任务持续领取版本不一致且未被领取的 data。同义词任务使用通用 `rebuildScope=text` 并固定为 `chunk`，不重新执行 VLM 或图片 embedding；worker 保留现有图片描述和 `imageEmbedding`，只重建文本向量与全文派生数据。成功写入时更新 `synonymVersion` 并释放领取标记；失败任务保留在现有 training 重试和错误处理流程中。同义词 rebuild training 不参与普通 training 的七天 TTL，避免 MongoDB 后台删除绕过应用层 claim 清理；用户手动删除任务时继续在事务中释放 claim。

## 4. 更新流程

上传、替换和删除共用 mutation 服务：

1. 校验知识库写权限和页面读取到的配置 ID/version。
2. 检查现有 `dataset_trainings` 和 `data.rebuilding`，队列忙时禁止再次修改。
3. 创建现有训练账单。
4. 在事务中写入新 mapping、CAS 切换配置、清理旧 mapping，并按目标版本领取 data、创建受 vector worker 并发上限约束的普通种子任务。
5. 事务提交后清理当前进程 matcher cache。
6. 后续任务由原 worker 在处理 `dataId` rebuild 时携带相同 scope 链式补充。

删除规则使用空 mapping，并立即设置 `enabled=false`。普通 rebuild 在没有 matcher 时以原文重新生成向量和全文派生数据。

mapping 写入、配置 CAS、首批 data 领取或种子任务创建失败会回滚整个事务，不产生半套 matcher、孤立 mapping 或只有领取标记没有任务的状态。事务提交后的 worker 故障沿用现有 training 重试；删除失败任务时释放领取标记，使同版本后续领取可以重新创建任务。

## 5. Worker 与状态

worker 不识别任务来源。所有带 `dataId` 的 training 都走已有 rebuild 路径，并在执行前补充下一条普通任务。

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
- 所有历史 data 都进入普通全量 rebuild，而非同义词差异任务；
- 同义词与模型切换生成相同的 training mode 和字段；
- 上传、替换和删除后 matcher 立即生效；
- 搜索始终保留原词并追加标准词；
- 多知识库搜索、mapping 分页和静态 i18n key。

## 9. TODO

- [x] mapping、配置与首批 training 创建使用同一 MongoDB 事务。
- [x] 使用物化版本差异保证待重建 data 可恢复领取。
- [x] 复用普通 training mode，通过目标版本字段驱动同义词重建。
- [x] 同义词与模型切换共用 rebuild 种子和链式任务创建。
- [x] 管理状态复用 data/training 查询。
- [x] 合并批量写入的配置快照读取，并只保留一次权威版本校验。
- [x] 增加默认关闭的服务端功能开关，关闭时跳过同义词查询和转换链路。
- [x] 将同义词 rebuild 排除出普通 training TTL，由现有重试和人工删除流程管理。
- [x] 运行定向测试、类型检查、格式检查和差异检查。
