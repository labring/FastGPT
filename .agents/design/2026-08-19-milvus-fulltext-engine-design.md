# Milvus 全文检索引擎设计

> 版本:2026-08-26
> 实现基座:main 分支。mongo 引擎路径与 main 现状一致;milvus 引擎为本设计新增路径。

## 1. 背景

FastGPT 全文检索现状基于 MongoDB `dataset_data_texts` 集合(`$text` 索引 + jieba 预分词),全文数据在数据写入时维护。

目标:引入 Milvus 2.5+ BM25 全文检索,当**实际向量库为 Milvus** 时自动启用(全文跟随向量库)。

本设计采用**单表方案**:向量与全文存于同一集合 `modeldata_v2`(新建,不动 `modeldata`);全文粒度固定为 `indexes[].text`;全文写入与向量 insert 同点同序;不做运行时版本探测与降级,启动/迁移时一次能力探测(含 `getVersion() >= 2.5` 版本门禁),不支持则报错退出;迁移仅支持旧表 `modeldata` 纯拷贝到 `modeldata_v2`,Milvus 数据已不在时改用 `rebuildEmbedding` 重建嵌入。

## 2. 需求拆解

| # | 需求 | 设计落点 |
|---|------|----------|
| 1 | 全文检索后端跟随实际向量库:milvus → BM25(`modeldata_v2` 单表),其他向量库 → Mongo `$text`;向量与全文控制器复用同一 provider 选择 | §4 环境变量、§5 统一表、§8 启动探测 |
| 2 | Milvus 正常运行时只使用 `modeldata_v2`;旧表 `modeldata` 仅迁移脚本内探测/加载;迁移后不自动删旧表,管理员验证后主动删(`removeOld=1` 显式 opt-in);删除后重启不重建/不访问 | §3 总体方案、§5、§8、§9 |
| 3 | 启动校验 Milvus 最低版本 2.5(推荐 2.5.16+):`getVersion()` 低于/无法获取/无法解析 → 抛错终止启动;版本通过后仍做 BM25/analyzer/schema 能力探测 | §8 启动探测 |
| 4 | 单表方案:向量、全文一张表 `modeldata_v2`;全文粒度固定 `indexes[].text` | §3 总体方案、§5 |
| 5 | 迁移脚本完善:旧表缺失/为空时(Milvus 数据已不在)报错并引导改用 `rebuildEmbedding` 重建嵌入;修复释放 `modeldata_v2` 后未重载就计数;完成条件实际校验目标表数量;迁移排除 imageEmbedding 的 BM25 文本 | §9 迁移 |
| 6 | milvus 语言识别器环境变量,默认 `lingua` | §4、§5.3 |

## 3. 总体方案

```
  全文后端跟随实际向量库(provider 单一来源):
  向量库 ≠ Milvus(pg/oceanbase/seekdb/opengauss)
                        │  向量   → 该向量库原表(modeldata 等)
                        │  全文   → MongoDB dataset_data_texts($text + jieba)
                        ▼
  向量库 = Milvus
                        │  向量+全文 → Milvus 集合 modeldata_v2 单表
                        │             (vector + text + BM25 sparse,
                        │              text = indexes[].text,
                        │              不写 mongo,只存一份)
                        │  检索     → dense / sparse BM25 同表
                        ▼

  启动幂等只创建/加载/校验一个集合:
  - modeldata_v2:向量 + 全文单表(provider=milvus 的向量+全文主表)
  旧表 modeldata 不在正常初始化中创建/检测/统计/加载,只允许出现在迁移脚本内(§9)。
  逻辑表名 `getDatasetVectorTableName()` 按 provider 解析:milvus → modeldata_v2;其他 → modeldata。
```

### 3.1 关键决策

测试数据见 3.4

1. **单表方案:向量、全文一张表 `modeldata_v2`**
   - 向量与全文**同表存储**:`modeldata_v2` = `modeldata` schema + `text`/`sparse` 字段;`text = indexes[].text`,`sparse` 由 BM25 function 从 `text` 自动推导。
   - **不动 `modeldata`**:`modeldata` 保留 main 现状(schema/index 不变),非 milvus 向量库(如 pg)仍以各自原表为向量主表;milvus 场景下 `modeldata` 仅作为迁移源由迁移脚本探测/加载。
   - 主键 `id = vectorId = indexes[].dataId`,类型沿用 main `modeldata` 的 **Int64**(与 `indexes[].dataId` 字符串一一对应)。**不冗余 `dataId` 字段**——按数据删除/孤儿清理通过向量 id 反查 `dataset_data.indexes[].dataId`(§7/§10)。
   - 全文数据**只存一份**:provider=milvus 时**不写** mongo `dataset_data_texts`;provider 非 milvus 时维持现状。
   - 优点:天然支持 milvus `hybrid_search`(dense + sparse 同表);无重复归属字段;全文与向量同写同删,写入时序天然一致(§3.3)。
   - 版本化:新建 `modeldata_v2` 而非就地改造 `modeldata`,schema 可版本化,迁移为拷贝而非重嵌入;不做运行时版本探测与降级,启动/迁移时一次能力探测。

2. **全文数据粒度:固定 `indexes[].text`(index 粒度)**
   - 单表方案下每行 = 一个向量 = 一个 index,天然为 index 粒度:`text = indexes[].text`,`id = vectorId = indexes[].dataId`。
   - data 粒度(q+a 整条一行)与向量行一一对应不成立,不支持;无独立的全文本源开关。

### 3.2 实现基座与参考

- 实现基座:main 分支。mongo 引擎路径与 main 现状一致(向量 `modeldata` + 全文 `dataset_data_texts`);milvus 引擎为本设计新增路径(`modeldata_v2` 单表)。
- 参考:旧分支 `feat-milvus-26-fulltext` 的 BM25 机制(analyzer、function)与 `fullTextRecall.ts` 的 `buildResultsFromRecallItems` 重构模式可参考采用。
- 版本机制:不引入版本探测 / feature level / 动态 schema / 运行时降级;启动与迁移各做一次能力探测,不支持即报错退出(§8/§9)。
- 检索返回归一化 `dataId`(mongo 主键即 dataId;milvus 单表无冗余 dataId,按向量 id 反查 `dataset_data.indexes[].dataId` 得到 dataId,§7)。
- 迁移为纯拷贝(创建 `modeldata_v2` + 从 mongo `dataset_data` 合并 `indexes[].text`),不重嵌入、不触发训练任务。

### 3.3 一致性原则与全文写入顺序

**一致性原则:** `dataset_data` 是数据唯一成功判据 —— 「dataset_data 成功才算成功」。全文索引是**派生数据**。main 现状在 mongo 会话内原子写 `dataset_data_texts`,天然满足"dataset_data 成功 ⇒ 全文成功";milvus 无法参与 mongo 事务,但单表方案下全文行即向量行,写入顺序问题消解为「跟随向量 insert」。

**写顺序(与向量 insert 一致):**

- milvus 引擎:**全文 text 随向量 insert 一并写入 `modeldata_v2`**(数据提交前,先写库后提交 mongo;向量 insert 失败即数据操作失败,与现状向量写一致)。全文写失败**没有独立方向** —— 向量 insert 成功则全文行已写入,失败则整体失败。
- mongo 引擎:维持现状(事务内原子写 `dataset_data_texts`,回滚不残留)。
- **向量库可以多写**:milvus 为 upsert 语义,同一主键重复写 / 中途状态可容忍;不依赖"只写一次"的强约束。
- **定时器清理异常**:回滚 / 删除失败残留的**孤儿向量行**(向量 + 全文一体,向量 id 无对应 `dataset_data`)对检索**无副作用**(检索时对缺失 data 打日志并跳过);沿用并强化现有按时间扫描孤儿向量的机制(§10),按 `createTime < now - TTL` 分页扫描 `modeldata_v2`,按向量 id 反查 `dataset_data.indexes[].dataId` 不存在即删除。

> 单表下「update 回滚残留的新全文行」即「残留新向量行」,与孤儿向量**完全同类**(存在级垃圾 + 引用失效,存在性判据可认出),由定时器清理,**无需**内容级比对或写序选型。

**`createTime`:** `modeldata_v2` 增加 `createTime`(Int64),用于上述残留悬空行清理扫描与运维定位。→ §5.2 已纳入。

### 3.4 命中率对比

> 命中率定义:固定查询集下,检索返回结果中相关命中的比例(记录时注明数据集规模与查询集条数,便于横向对比)。数值待基准测试填充,用于收口决策:mongo vs milvus(index 粒度)的命中表现。

**表:mongo vs milvus(引擎对比,`text = indexes[].text`)**

| 测试场景 | 说明 | mongo 命中率 | milvus(index) 命中率 | 备注 |
|---|---|---|---|---|
| 中文短语(2~4 字) | 如「全文检索」 | - | - | |
| 中文长句 | 整句作为查询 | - | - | |
| 英文单词/短语 | | - | - | |
| 中英混合 | | - | - | |
| 专业术语/生僻词 | jieba / BM25 分词未覆盖 | - | - | |
| 长文本截断 | 超长 text 截断边界 | - | - | |
| 英文-智能客服（3w data、200w index） | FAQ | Hit@1: 63/268=23.51%</br>Hit@10: 154/268=57.46%</br>Hit@50: 167/268=62.31% | Hit@1: 114/268=42.54%</br>Hit@10: 200/268=74.63%</br>Hit@50: 218/268=81.34% | 提升:</br>Hit@1 +19.03pp</br>Hit@10 +17.17pp</br>Hit@50 +19.03pp |

> 说明:milvus 列为 **index 粒度**(`text = indexes[].text`);全文粒度固定为 index(§3.1)。数值待基准测试确认后收口。

## 4. 环境变量设计

`packages/service/env.ts`:

| 变量 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `MILVUS_LANGUAGE_IDENTIFIER` | `lingua` \| `whatlang` | `lingua` | milvus 语言识别引擎(BM25 analyzer) |

校验规则:
- `MILVUS_LANGUAGE_IDENTIFIER` 非法值 → 启动报错退出。
- 全文后端跟随实际向量库(provider 单一来源 `getVectorType()`,见 §8)。

## 5. Milvus 全文集合

### 5.1 表名与数据库

- **集合 `modeldata_v2`**(新增常量 `DatasetVectorTableNameV2 = 'modeldata_v2'`):向量 + 全文统一表,provider=milvus 时的向量 + 全文主表(正常初始化只创建/加载/校验它)。
- **旧表 `modeldata`**(`DatasetVectorTableName = 'modeldata'`,main 现状):纯向量表,**不在正常初始化中创建/检测/统计/加载**,只允许出现在迁移脚本内(作为迁移源;Milvus 数据已不在时迁移不可用,改用 rebuildEmbedding)。
- **逻辑 alias**:`getDatasetVectorTableName()` 按 provider 解析 —— milvus → `modeldata_v2`,其他向量库 → `modeldata`。
- 数据库:在 vector 库(默认 `fastgpt`)。

### 5.2 Schema(`modeldata_v2`,向量 + 全文)

字段:

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Int64 PK(与 main `modeldata` 一致) | 主键 = 向量 id,与 mongo `indexes[].dataId` 一一对应 |
| `vector` | FloatVector(main `modeldata` 同维度) | dense 向量 |
| `text` | VarChar (65535),`enable_analyzer` + `enable_match` | BM25 输入文本 = `indexes[].text`。超长截断(沿用 `MILVUS_TEXT_MAX_LENGTH` 常量) |
| `sparse` | SparseFloatVector | BM25 输出稀疏向量 |
| `createTime` | Int64 | 写入时间(毫秒)。用于残留悬空行清理(§3.3/§10)与运维定位 |
| `teamId` / `datasetId` / `collectionId` | VarChar (64) | 归属信息,用于检索过滤与批量删除 |

> **不冗余 `dataId` 字段**:按数据删除 / 反查 / 孤儿清理一律通过向量 id 反查 `dataset_data.indexes[].dataId`(`id` 与 `indexes[].dataId` 一一对应,§7/§10)。

Function(BM25):`text` → `sparse`(`FunctionType.BM25`)。

Index:

| 字段 | index_type | 说明 |
|---|---|---|
| `vector` | 沿用 main `modeldata` 向量索引 | dense 向量检索 |
| `sparse` | `SPARSE_INVERTED_INDEX`,metric `BM25`,params `{ bm25_k1: 1.2, bm25_b: 0.75 }` | 全文检索 |
| `createTime` | `STL_SORT` | 残留数据清理扫描 |
| `teamId` / `datasetId` / `collectionId` | `Trie` | 过滤 / 批量删除 |

### 5.3 Analyzer(language_identifier)

由 `MILVUS_LANGUAGE_IDENTIFIER` 决定识别引擎与 analyzer key 映射:

| 识别引擎 | 中文 key | 配置 |
|---|---|---|
| `lingua`(默认) | `Chinese` | `Chinese: { tokenizer: 'jieba' }` |
| `whatlang` | `Mandarin` | `Mandarin: { tokenizer: 'jieba' }` |

```ts
// 构造 analyzer params(env → 常量,仅此一处)
const buildAnalyzerParams = (identifier: 'lingua' | 'whatlang') => ({
  tokenizer: {
    type: 'language_identifier',
    identifier,
    analyzers: {
      default: { tokenizer: 'standard' },
      English: { type: 'english' },
      ...(identifier === 'lingua'
        ? { Chinese: { tokenizer: 'jieba' } }
        : { Mandarin: { tokenizer: 'jieba' } })
    }
  }
});
```

> 注意:两个识别引擎对同一语言返回的名字不同(`Mandarin` vs `Chinese`),analyzer key 必须与识别引擎输出精确匹配,否则中文回落到 `standard` 分词导致召回退化。这是 milvus 2.5 的已知行为(见 milvus 官方语言识别器文档)。

> 使用**单一 `language_identifier` analyzer**。启动时已探测能力,不支持即退出,无需运行时降级链。

## 6. 写入链路

### 6.1 统一全文接口(textStore.ts)

全文检索统一接口封装在 `packages/service/core/dataset/data/textStore.ts`:

- 定义:`FullTextStore` 接口、`FullTextSearchProps`、`FullTextSearchItem`、`FullTextWriteProps`。接口含 `search` + 写/删方法(§6.2):**mongo 实现真实落库**;milvus 引擎由向量 insert/update/delete 通道承载(单表下全文行即向量行),其写/删实现为**空操作**。
- `MongoFullTextStore`:mongo 引擎实现,`search` 走 `$text` + jieba(基于现有 `MongoDatasetDataText`);写/删实现真实落库(事务内路径仍由 data 层直接调用以保证原子性,§6.3)。
- `MilvusFullTextStore`:milvus 引擎实现,`search` 对 `modeldata_v2` 做 BM25 sparse(按向量 id 反查 dataId,§7);`write`/`deleteByDataId`/`deleteByDatasetIds`/`deleteByCollectionIds` 为空操作。
- `getFullTextStore(): FullTextStore`:按 provider 返回实现(milvus → `MilvusFullTextStore`;其他 → `MongoFullTextStore`)。分词只在 `MongoFullTextStore.write` 内部发生(milvus 分支为 no-op,不触发分词)。
- milvus 实现 `MilvusFullTextStore` 放 `packages/service/common/vectorDB/milvus/fullText.ts`。

**milvus 写路径(与向量 insert 同点同序,§3.3):** 单表方案下全文行即向量行,全文 text **随向量 insert 一并写入** `modeldata_v2`(向量 insert 携带 `indexes[].text`,BM25 function 在 milvus 内部推导 sparse),**没有独立的 milvus 全文写/删调用**(删除走向量 `delete`,`modeldata_v2` 行)。mongo 引擎写/删维持现状(事务内原子写 `dataset_data_texts`)。

**循环引用检查**:`milvus/fullText.ts` 对 `textStore.ts` 仅 **type-only import**(`import type { FullTextStore, ... }`),运行时被擦除;`textStore.ts` 对 `milvus/fullText.ts` 是值导入。运行时依赖图单向(`textStore → milvus/fullText`),**无运行时循环**。

### 6.2 FullTextStore 接口

```ts
// textStore.ts
export type FullTextSearchProps = {
  teamId: string;
  datasetIds: string[];
  query: string;
  limit: number;
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
};

export type FullTextSearchItem = {
  dataId: string;      // dataset_data._id(mongo 主键即 dataId;milvus 按向量 id 反查)
  collectionId: string;
  score: number;
};

export type FullTextWriteProps = {
  dataId: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  fullTextToken: string;
};

export interface FullTextStore {
  search(props: FullTextSearchProps): Promise<FullTextSearchItem[]>;
  // 写/删契约:mongo 实现真实落库;milvus 实现为空(写/删由向量 insert/update/delete 通道承载)
  write(props: FullTextWriteProps[]): Promise<void>;
  deleteByDataId(dataId: string): Promise<void>;
  deleteByDatasetIds(props: { teamId: string; datasetIds: string[] }): Promise<void>;
  deleteByCollectionIds(props: {
    teamId: string;
    datasetIds: string[];
    collectionIds: string[];
  }): Promise<void>;
}
```

> 检索结果统一返回 `dataId`(mongo 主键即 dataId;milvus 单表无冗余 dataId,按向量 id 反查 `dataset_data.indexes[].dataId` 得到 dataId),**不用** `EmbeddingRecallItemType[]`(`id` 字段会混淆 dataId / vectorId)。

写/删不在 Store 接口内,按引擎走各自通道:

| 操作 | mongo 引擎(`modeldata` 向量 + `dataset_data_texts` 全文) | milvus 引擎(`modeldata_v2` 向量 + 全文) |
|---|---|---|
| 写入(insert/update 路径) | `insertVectors` 写 `modeldata`;事务内写 `dataset_data_texts`(jieba(q+a),按 dataId upsert,按 `FULL_TEXT_WRITE_BATCH_SIZE`=50 分片 `bulkWrite`) | `insertVectors` 携带 `indexes[].text` 写 `modeldata_v2`(每行 text,BM25 推导 sparse),无独立全文写;失败粒度 = 向量 insert 整批(§9.3/§9.4 据此收集失败行) |
| 删除(data/collection/dataset) | 事务内删 `dataset_data_texts` | milvus `delete`(`modeldata_v2` 行,filter 同向量删除:`dataId` / `teamId`+`datasetId in [...]` / +`collectionId in [...]`) |
| search(Store 接口) | `$text` + jieba 聚合 | BM25 sparse(`anns_field: 'sparse'`,对 `modeldata_v2`) |
| 幂等 | mongo upsert | milvus upsert(PK=id) |

### 6.3 写入时序与落点(§3.3,与向量 insert 同点同序)

milvus 引擎全文与向量同表同写,**时序跟随向量 insert**:

```
create 流程(milvus 引擎):insertVectors(携带 indexes[].text → modeldata_v2,先写库)→ MongoDatasetData.create(提交)
update 流程(milvus 引擎):mongoSessionRun(更新 data;向量 update 携带 text → modeldata_v2)
delete 流程(milvus 引擎):mongoSessionRun(删 data)→ milvus `delete`(`modeldata_v2` 行,filter 向量 id)
```

落点钉死:
- `createDatasetData` 的调用方 `insertData.ts` **不传 session**(自动提交)、`generateVector.ts` **会传 session**(外层 `mongoSessionRun`)。milvus 引擎下向量 + 全文都在**数据提交前**写入(与现状 `insertVectorForPatch` 在 `mongoSessionRun` 之前一致),不接收 session。
- 顺序语义:若外层 session 在 create() 返回后回滚,残留**孤儿向量行**(向量 + 全文一体)——**无害**(检索时对缺失 data 打日志并跳过),由 §3.3/§10 的 `createTime` 清理任务回收;与现状孤儿向量完全同类。
- 故障域:milvus 写失败即向量 insert 失败 → 数据操作失败(与现状向量写一致);mongo 引擎维持事务内原子写,回滚不残留。
- **向量库可以多写 + 定时器清理**:重复写 / 中途状态容忍(§3.3);残留由定时任务按 `createTime` 扫描删除(§10)。

### 6.4 写点改造

| 写点 | 文件 | milvus 引擎 | mongo 引擎 |
|---|---|---|---|
| data 创建 | `projects/app/src/service/core/dataset/data/data.ts` `create` | `insertVectors` 携带 text(→ `modeldata_v2`) | `insertVectors`(`modeldata`)+ 事务内写 `dataset_data_texts` |
| q/a 更新 | 同上 `update`(两处) | 向量 update 携带 text(upsert 覆盖) | 同上 |
| data 删除 | 同上 `delete` | milvus `delete`(filter 向量 id idList) | 事务内删除 |
| 按 collection 删除 | `packages/service/core/dataset/collection/controller.ts` | milvus `delete`(filter `teamId`+`datasetId`+`collectionId`) | 事务内删除 |
| 按 dataset 删除 | `packages/service/core/dataset/controller.ts` | milvus `delete`(filter `teamId`+`datasetId in [...]`) | 事务内删除 |

> milvus insert **需新增 text 入参**(每 index 一行,text = `indexes[].text`,与向量一一对应);`indexes[].text` 在 data.ts `create/update` 流程中可得(`newIndexes`),无需额外回查。mongo/pg/oceanbase 引擎忽略该入参,向量控制器接口其余保持 main 现状。

## 7. 检索链路

改造 `packages/service/core/dataset/search/defaultRecall/fullTextRecall.ts`(当前 main 只走 mongo 聚合):

1. **重构**:抽出 `mongoFullTextRecall`(现有 mongo 聚合)+ `buildResultsFromRecallItems`(现有 data/collection 回查与结果组装),保持 mongo 行为不变。
2. **按 `getFullTextEngine()` 分支**:
   - `mongo` → 走 `MongoFullTextStore.search` + `buildResultsFromRecallItems`。
   - `milvus` → 走 `MilvusFullTextStore.search`(对 `modeldata_v2` 做 BM25 sparse 检索)。
   - 两种实现都经统一 facade 返回 `FullTextSearchItem[]`(`{ dataId, collectionId, score }`,已归一化),recall 层直接映射到 `RecallItem` 后走同一个 `buildResultsFromRecallItems`。
3. **不引入运行时版本检查与降级**:milvus 不可用(未配置/不支持)在启动/迁移时已报错退出,不存在运行时回落 mongo。
4. 单表无冗余 `dataId`,store 按向量 id 反查 `dataset_data.indexes[].dataId` 得到 `dataId`(一个向量 id 恰对一条 dataset_data),返回 `dataId`。

检索 filter 沿用现状:`(teamId == X) and (datasetId in [...]) [collectionId in/not in ...]`,`anns_field: 'sparse'`,`params: { metric_type: 'BM25' }`,`output_fields: ['dataId', 'collectionId']`。

## 8. 启动初始化与能力探测

在 `projects/app/src/instrumentation-node.ts` 的 `init-vector-store` 步骤内与 vector store 一并执行(provider=milvus 时):

1. `getClient()`:`MILVUS_ADDRESS` 未配置 → throw(启动失败)。
2. **版本门禁**:`client.getVersion()` 校验 **≥ 2.5**(推荐 2.5.16+);低于 2.5、无法获取或无法解析版本 → 抛错,**终止启动**(不做 warning 降级)。
3. **只创建/加载 `modeldata_v2`(幂等)**:`useDatabase` + `hasCollection`,不存在则 `createCollection`(`modeldata` schema + `text`/`sparse`,BM25 function + language_identifier analyzer + 向量/BM25 index),再 `loadCollection`。**旧表 `modeldata` 不在此创建/检测/统计/加载**(迁移完成后 drop 旧表,重启也不会重建)。
4. **能力探测**:版本通过后仍 `describeCollection` 校验 `modeldata_v2` 的 `text`/`sparse` 字段存在(BM25/analyzer/schema 能力)。
5. 任一步失败 → `logger.error` + 抛出 → 启动流程记录 `VECTORDB_ERROR` → **进程退出**(复用现有 `runInitializationStep` 机制)。

> provider 非 milvus 时走对应向量库自己的 init,不涉及本流程。
>
> 实现注意:SDK 升级(§11)可能引入 API 适配(如 `embRecall` 的 `searchParams.data` 而非 `vector`)。

## 9. 全量迁移脚本(Admin API)

### 9.1 接口

`GET /api/admin/initMilvusFullText`(`authCert({ authRoot: true })`,与 `initv4152` 同模式)

Query 参数:

| 参数 | 必填 | 说明 |
|---|---|---|
| `batchSize` | 否 | 默认 500 |
| `dryRun` | 否 | `true`/`1` 时只统计不写入 |
| `removeOld` | 否 | `true`/`1` 时迁移校验通过后**显式 drop 原 `modeldata` collection**(管理员验证后主动删除,非自动;仅留日志审计;向量数据已完整拷贝至 `modeldata_v2`) |
| `resumeMigrationId` | 否 | 断点续跑:沿用已有 migrationId 从 cursor 继续 |

方向固定:**mongo 全文 → milvus `modeldata_v2`**,源 = 旧 milvus `modeldata` 向量 + mongo `dataset_data` 文本,**纯拷贝**(不重嵌入)。

> **前提与另一路径**:若 Milvus 数据仍在(旧表 `modeldata` 存在且有向量,如原地升级)→ 用本接口拷贝;若 Milvus 数据已不存在(跨版本重装/全新实例)→ 本接口无法拷贝向量,改用 **`POST /api/core/dataset/training/rebuildEmbedding`**(从 dataset_data 全量重嵌入,走训练队列)。本接口在旧表缺失/为空时报错并给出该提示。

### 9.2 迁移语义

流程:

1. **校验**:provider 必须为 milvus;`assertMilvusVersion` + `assertFullTextCapability` 能力探测(§8 同款),不支持则报错退出。
2. **旧表探测/加载**(全部封装在迁移脚本内,init 不碰 `modeldata`):`hasCollection(modeldata)`,存在则 load 并 count;缺失/为空 → 报错引导走 rebuildEmbedding(见上)。
3. **迁移数据**:遍历 milvus `modeldata` 向量行(光标 `id` 递增),逐行按 `{ 'indexes.dataId': vectorId }` 查 mongo `dataset_data`,取该 index 的 `text` 与归属;命中 → 写入 `modeldata_v2`:`{ id=vectorId, vector, text, teamId, datasetId, collectionId, createTime }`;未命中(孤儿)计 `skippedCount`;**`imageEmbedding` 索引只保留向量,BM25 文本置空**;目标幂等 upsert(PK=id)。
4. **计数校验**:收尾**先 `ensureCollectionLoaded(modeldata_v2)`(已加载则 no-op)、再 `flush`、再统计目标实际行数**;完成条件 = `failed === 0 && processed + skipped === sourceCount && targetCount >= processed`(实际校验目标表数量,不能只依赖 processed/skipped)。
5. **release 原 `modeldata`**:校验通过后 `releaseCollection(modeldata)`(卸载,释放内存;数据未删除,回滚仍可用)。
6. **`removeOld`**:`true` 时**显式 drop 原 `modeldata` collection** 并清空 mongo `dataset_data_texts`(管理员主动删除,非自动;drop 后回滚需重建向量,见 §12)。

说明:
- **前提**:部署的向量库为 milvus。非 milvus 向量库(如 pg/oceanbase)的 dense 向量无法直接拷贝,不在本迁移范围(需先迁移向量库或重嵌入,§13)。
- `imageEmbedding` 的 BM25 文本在**实时写入与迁移**保持一致地置空(不索引图片 URL/S3 key)。
- `dataset_data_texts`(mongo 旧全文)在 provider=milvus 下不再读写;仅 `removeOld=1` 时由迁移脚本清空,否则保留供审计/回滚。

### 9.3 流程、断点续跑与迁移期间新数据

**流程:**
1. 校验:provider 必须为 milvus、目标能力探测(§8)。
2. 统计:源行数(`modeldata` 行数)、预估批次数(`dryRun` 只读返回)。
3. 分批搬运 + 进度持久化(见下"断点续跑");失败行收集并继续。
4. 计数校验:收尾 reload + flush 后比对目标实际行数(`targetCount >= processed`),不一致则报错并给出差异清单。
5. `removeOld`(可选):校验通过后显式 drop 原 `modeldata` collection(仅留日志审计)。

**断点续跑(光标):**
- 进度记录在 `full_text_migration_logs`(schema 见 §9.4):`{ migrationId, newEngine, status: 'running'|'done'|'failed', cursor, totalCount, processedCount, skippedCount, failedCount, error, updatedAt, createdAt }`,每批提交后按 `migrationId` `updateOne`。
- 光标语义:源按 milvus `modeldata.id`(vectorId 字符串,插入序近似递增)递增分页 → `filter: "id > cursor"` + `limit(batchSize)`。
- 续跑:再次调用带 `resumeMigrationId`,读 `status='running'|'failed'` 的记录从 `cursor` 继续;无记录则全量重跑。**幂等兜底**:目标写按 id upsert,光标即使回退/重复,重写也不产生重复数据。
- 失败处理:失败行(以向量 insert 批为原子,50 片级)持久化到 `full_text_migration_failed`(§9.4,按 dataId upsert,`bulkWrite` ordered:false),**失败行全部落库**(行级失败量级可控,落库让续跑与审计精确);批次内对失败片统一重试一次,仍失败保留,主循环结束后再逐条自愈重试(§9.4 消费),仍失败则保留待续跑补齐。

**迁移期间新数据:**
- **推荐操作顺序:先切引擎,再迁移**。切引擎后:
  - 新数据经 live 写路径直接写 `modeldata_v2`(向量 + 全文,只存一份),不再写 mongo 旧全文 → 迁移源(milvus `modeldata` + mongo `dataset_data`)是**固定快照**。
  - 迁移写目标与 live 写目标均按 id upsert,且 **id 不相交**(源只含切引擎前的老向量),无重复/冲突。
- **迁移失败 + 期间有新数据**:迁移是幂等 upsert,**重跑安全**;新数据 id 不在源中,重跑不会触碰它们。
- **唯一竞态**:迁移扫描到的某个 `modeldata` 向量行恰在迁移期间被 live **更新**(目标先写新文本,迁移随后写旧文本)→ 窗口极窄;自愈路径:该数据下次任何更新会重写全文,或迁移跑完后再跑一次作为一致性收尾(幂等)。文档注明:迁移建议在低写入时段执行。

### 9.4 迁移状态表与失败行表(`full_text_migration_logs` / `full_text_migration_failed`)

两个集合都建在默认 mongo 连接,**不参与业务事务**(迁移本身是分批外置写,进度与失败行独立持久化,与数据主库解耦)。schema 集中在 `packages/service/core/dataset/fullText/schema.ts`,均由 `getMongoModel` 生成模型。

**表一 `full_text_migration_logs` — 迁移进度 / 断点日志(每迁移实例一行)**

| 字段 | 类型 | 说明 |
|---|---|---|
| `migrationId` | string(UUID,唯一) | 迁移实例 ID,断点续跑凭此恢复;非 dry-run 且无 `resumeMigrationId` 时 `create` |
| `newEngine` | `'milvus'` | 目标引擎(方向固定 mongo → milvus),续跑时校验与本次请求一致,不一致报错(防错续) |
| `status` | `'running'` \| `'done'` \| `'failed'` | 默认 `running`;全部成功且计数校验通过为 `done`,有失败行或计数不一致为 `failed` |
| `cursor` | string | 断点光标(已处理源行的上界)。milvus `modeldata.id`(向量行 id,插入序近似递增)。空串 = 从头全量 |
| `totalCount` | number | 起始源行数(`modeldata` 向量行数) |
| `processedCount` | number | 已成功写入目标的行数(续跑自愈成功也会回填) |
| `skippedCount` | number | 跳过行数(非法 ObjectId、`dataset_data` 已删除的孤儿行) |
| `failedCount` | number | 失败行数(仍留在 failed 表,等续跑补齐) |
| `error` | string(optional) | 失败原因摘要。当前实现经返回值携带最终错误,日志行字段预留;如需审计可随收尾 `updateOne` 一并落库 |
| `createdAt` / `updatedAt` | Date | 审计与实例存活判断 |

索引:

| 索引 | 类型 | 作用 |
|---|---|---|
| `{ migrationId: 1 }` | **unique** | 续跑 `findOne({ migrationId })`;同一实例并发重入由唯一键约束阻止(重复 `create` 抛 duplicate) |
| `{ status: 1, updatedAt: 1 }` | 普通 | 运维查询进行中 / 历史迁移;`updatedAt` 长时间未推进可判定迁移进程已死,可人工接管续跑 |

生命周期:
1. 非 dry-run 且无 `resumeMigrationId`:`create`(status=`running`,cursor='');续跑沿用已有行,不新建。
2. 每批搬运后:`updateOne({ migrationId }, { $set: { cursor, processedCount, skippedCount, failedCount, updatedAt } })`——断点随每批落盘,进程中途被杀,下次从 `cursor` 续,不重复不遗漏。
3. 收尾:先消费 failed 表(见下),再按最终结果置 `done`/`failed` 并更新最终计数;历史日志保留供审计,不做自动清理。

**表二 `full_text_migration_failed` — 失败行(失败一次记录一行)**

| 字段 | 类型 | 说明 |
|---|---|---|
| `migrationId` | string | 归属迁移实例 |
| `dataId` | string | 失败行对应的 `dataset_data._id`(ObjectId 字符串) |
| `error` | string | 失败原因(便于续跑后人工核查) |
| `createdAt` | Date | 失败时间 |

索引:`{ migrationId: 1, dataId: 1 }` **unique** —— 批量 upsert 幂等(`updateOne` filter `{ migrationId, dataId }` + `$set` error + upsert,`bulkWrite` `{ ordered: false }`):同 dataId 重复失败只更新 error、不产生重复行;自愈成功后按同键 `deleteOne`。

生命周期:
1. **写入**:批次内某 50 片失败(片内整片收集),`bulkWrite` upsert 落库。**全部失败都持久化**(行级失败量级可控,落库后续跑与审计精确)。
2. **消费(续跑自愈)**:主循环结束后读本 `migrationId` 全部失败行,逐条重试:
   - 成功 → `deleteOne` + `processedCount+1` + `failedCount-1`(自愈行自动移出失败表,计数回填);
   - `dataset_data` 已删除(孤儿)→ 视为跳过,`deleteOne` + `skippedCount+1`;
   - 仍失败 → 保留,最终 `status='failed'`,返回提示带 `resumeMigrationId` 再跑。
3. 集合无行数上限(失败即记);实例迁移成功后自愈行清空,无残留,天然收敛。

> 两表分工:logs 表回答「迁到哪、剩多少、从哪续」,failed 表回答「哪几行失败了、原因是什么」。续跑 = 读 logs 的 cursor 继续主循环 + 读 failed 表逐条补齐,两表协同构成完整的断点续跑语义(§9.3)。

## 10. 可靠性设计

| 场景 | 措施 |
|---|---|
| 全文写入失败 | milvus 引擎全文与向量同写 `modeldata_v2`,写失败 = 向量 insert 失败 → 数据操作失败(与现状向量写一致),无独立全文失败方向;mongo 引擎事务内原子写 |
| 残留悬空行(回滚/删除失败) | 孤儿向量行(向量 + 全文一体)对检索**无副作用**(`buildResultsFromRecallItems` 已对缺失 data/collection 打日志并跳过);**残留清理任务**(挂 `cronTask.ts`):按 `createTime < now - TTL`(默认 7 天)分页扫描 `modeldata_v2`,按向量 id 反查 `dataset_data.indexes[].dataId` 不存在即删除(§3.3) |
| 写入幂等 | milvus upsert(PK=id);mongo 引擎按 dataId upsert |
| 迁移 | dry-run、断点续跑、幂等写入、计数校验、失败收集、迁移后 release 原 `modeldata`、`removeOld` 直接 drop |
| 启动/迁移探测 | provider=milvus 时版本(<2.5)或 BM25/analyzer 不支持 → 报错退出,杜绝带病运行 |
| 一致性边界(已接受) | milvus `modeldata_v2` 与 mongo 数据最终一致;回滚残留孤儿行由 `createTime` 定时任务回收 |

## 11. 文件改动清单(基于 main)

**新增**
- `packages/service/core/dataset/data/textStore.ts` — 统一全文接口:`FullTextStore`(仅 `search`)/ `FullTextSearchProps` / `FullTextSearchItem` + `MongoFullTextStore`(mongo 检索实现,分词内部发生)+ `getFullTextStore()`(按 provider 分发)(§6.1/§6.2)
- `packages/service/common/vectorDB/milvus/fullText.ts` — `MilvusFullTextStore` + `getMilvusFullTextStore`(`modeldata_v2` BM25 `search` 归一化 + 能力探测);对 `textStore.ts` 仅 type-only import
- `packages/service/common/vectorDB/milvus/fullTextConfig.ts` — `modeldata_v2` schema / index / BM25 function / analyzer(`MILVUS_LANGUAGE_IDENTIFIER` 映射)
- `projects/app/src/pages/api/admin/initMilvusFullText.ts` — 全量迁移脚本(mongo → milvus,§9)
- 常量:`DatasetVectorTableNameV2 = 'modeldata_v2'`;`FULL_TEXT_WRITE_BATCH_SIZE = 50`(mongo 全文批量写入分片上限,置于 `common/vectorDB/constants.ts`,§6.2)
- mongo `full_text_migration_logs` / `full_text_migration_failed` schema(迁移断点进度、失败行,§9.4)

**修改**
- `packages/service/package.json` — `@zilliz/milvus2-sdk-node` `2.4.10` → `^2.6.0`(BM25 function / `FunctionType.BM25` / language_identifier 支持),并适配 SDK 2.6 API 变更
- `packages/service/env.ts` — 新增 `MILVUS_LANGUAGE_IDENTIFIER`(默认 `lingua`)(§4)
- `packages/service/common/vectorDB/milvus/index.ts` — 适配 SDK 2.6(`embRecall` 的 `searchParams.data`);向量 insert 新增 text 入参(provider=milvus 时写 `modeldata_v2`,校验 `texts.length === vectors.length`,§6.4)
- `packages/service/core/dataset/search/defaultRecall/fullTextRecall.ts` — 重构出 mongo 路径 + `buildResultsFromRecallItems`,新增 milvus 引擎分支(§7)
- `projects/app/src/service/core/dataset/data/data.ts` — `create`/`update`(两处)/`delete` 写点改造:milvus 引擎向量 insert 携带 `indexes[].text`(→ `modeldata_v2`),mongo 引擎维持现状(§6.4)
- `packages/service/core/dataset/collection/controller.ts`、`packages/service/core/dataset/controller.ts` — 批量删除门控(§6.4)
- `projects/app/src/service/common/system/cronTask.ts` — 挂残留悬空行清理任务(§10)

**测试**
- 单测:`env` 校验、analyzer 映射(`lingua`/`whatlang`)、`fullTextStore` 检索归一化、milvus delete filter、迁移幂等
- 集成测试(需 Milvus 2.5+,推荐 2.5.16+):`modeldata_v2` 创建/插入(向量+全文)/BM25 检索/删除
- 迁移脚本手工验收清单(dry-run、断点、计数校验)

## 12. 兼容性与回滚

- **provider ≠ milvus(pg/oceanbase/seekdb/opengauss)**:向量走各自原表,全文仍走 mongo `dataset_data_texts`,路径零改动,行为与 main 完全一致。
- **provider = milvus**:
  - 升级到本版本(Milvus 数据仍在):已有 milvus `modeldata` 向量 + mongo 全文 → 先跑迁移脚本(拷贝向量 + 合并 `indexes[].text` 到 `modeldata_v2`)。
  - 全新 Milvus(Milvus 数据已不在):无向量可拷贝,用 `rebuildEmbedding` 从 dataset_data 重建嵌入(§9)。
  - 回退到非 milvus 向量库:切换向量库后,全文回 mongo(向量由新向量库重建);milvus 期间的全文数据在 `modeldata_v2`,回退后不再检索。**若迁移执行过 `removeOld`(已 drop `modeldata`),回退需先重建向量(重新嵌入或从备份恢复);未执行 `removeOld` 时 `modeldata` 仅被 release 未删除,可直接切换。**
- 文档:补充 `.env` 示例与 `MILVUS_LANGUAGE_IDENTIFIER` 说明;升级文档写明「Milvus 数据仍在 → `initMilvusFullText`;Milvus 数据已不在 → `rebuildEmbedding`」。
- 从旧分支升级:旧分支 `modeldata` 已含 `text/sparse` 字段与 `textContents` 数据,需走迁移脚本将向量与文本搬入 `modeldata_v2`,并重建 `modeldata`(丢弃 text/sparse)或由部署方手工处理——迁移脚本不处理该场景,文档中注明。

## 13. 开放问题

- 残留清理任务扫描频率与 TTL 阈值(默认 7 天)。
- 非 milvus 向量库部署(如 pg/oceanbase)使用 milvus 全文的路径(需先迁移向量库或重嵌入)—— 本设计范围外,不实现。
- 迁移脚本对「旧分支单表残留数据」(部署过旧分支、`modeldata` 已含 text/sparse)的处理 —— 当前为文档说明,不实现。
