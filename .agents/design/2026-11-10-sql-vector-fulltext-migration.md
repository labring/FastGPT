# PG、OceanBase、SeekDB、OpenGauss 原生全文检索适配与数据迁移方案

> 状态：四种 SQL 检索库统一适配各自原生全文检索并接入平滑切读与兼容期双写保留；新装与升级由各向量控制器 `init()` 自动建齐基础表、`fulltext_tokens` 列和向量索引（全文索引/扩展创建置于非阻塞 `try / catch`，避免旧镜像缺扩展阻断启动），存量升级由手动确认触发的升级任务 `20261110_migrate_sql_fulltext`（`manual: true`）在集群旧节点全部升级排空后顺序完成结构核验、只读预检、分批回填与全量完整性校验，校验通过后写入 `dataset_sql_fulltext_targets` 标记并将 `SqlFullTextStore` 读取从旧 Mongo `$text` 平滑切换至 SQL 原生全文检索，兼容期内继续维护 `dataset_data_texts` 双写/双删及其索引。更新日期：2026-11-13。
>
> 源码基线：`upstream/main`；工作分支：`yyh/dataset-unified-search`。
>
> 范围：四个 SQL 检索 provider 的业务代码改造与生产存量数据迁移。本文件不包含 Milvus / Zilliz 的迁移、集合改造或适配器重构。

## 1. 目标与总体决策

让使用 PG、OceanBase、SeekDB、OpenGauss 的部署与 Milvus 对齐，统一由当前选择的向量检索库在单表 `modeldata` 中同时提供向量召回和全文召回，并在升级期间通过平滑切读与兼容期双写保证存量服务零中断与可回退。

确定采用以下路径：

```text
开机 init() 建齐基础表与 fulltext_tokens 列（非阻塞尝试建全文索引） → 新写入同行写向量与词串并保持 Mongo 旧全文双写 → 管理员确认节点升级排空后手动执行 20261110_migrate_sql_fulltext（结构核验 → 全量只读预检 → 分批回填 → 全量完整性校验 → 激活目标就绪标记切读）
```

核心约定：

- 保留已有向量、向量 ID、业务原文及现有向量索引，本次迁移不重新调用 embedding 模型。
- 新全文放在当前检索库的既有 `modeldata` 表中，按每条索引一行存储，与对应向量共同维护。**检索库只存 FastGPT 外置分析器输出的词串（`fulltext_tokens` 列），不存原文**；原文以 Mongo 为准。
- 用户继续使用统一的检索模式、返回数量、过滤范围、混合权重和重排设置。各适配器内部维护各自的默认全文配置。
- **共用一套迁移编排，逐库适配底层操作**；单个部署只迁移实际配置的 provider，不要求同时部署四个数据库。
- 本轮不增加 MongoDB 向量 provider，不搬迁不同 provider 之间的向量；Milvus / Zilliz 继续沿用已有路径。
- 四库的适配代码与共同迁移流程已接入，当前实现和验证边界见第 12 节；代码完成不等于已通过逐库效果与生产发布验收。

## 2. 不同数据库是否需要单独适配

**需要。统一业务接口与迁移流程，不要求四个数据库执行相同 SQL 或使用相同参数。**

| 层次 | 共用还是独立 | 内容 |
|---|---|---|
| 用户检索设置 | 共用 | 模式、limit、过滤范围、全文/向量权重、RRF、rerank |
| 业务文本规则 | 共用 | 按索引生成文本、同义词版本、图片向量空全文、业务 ID 映射与去重 |
| 迁移编排 | 共用 | 阶段、任务状态、lease、游标、失败重试、进度、切换、回退与清理门槛 |
| 数据库底层操作 | 逐库适配 | 版本/扩展检查、DDL、全文索引、分词配置、全文 SQL、条件补文本、索引可见性 |
| 正确性与性能验收 | 逐库执行 | 每个目标数据库版本、分词器、过滤条件、查询计划、写入和召回行为 |

复用边界：

- **PG：单独适配。** PostgreSQL 扩展、全文索引和相关性 Top-K 查询需要自己的实现。
- **OceanBase：单独适配。** 使用 MySQL 模式的原生 FULLTEXT，负责其版本、分词器和 DDL 能力检查。
- **SeekDB：独立能力声明，可复用 OceanBase 基础实现。** 当前向量控制器已复用 OceanBase；全文也优先复用经验证一致的部分。存在差异时通过明确分支处理，不假定所有版本完全兼容，不为相同实现创建无意义包装文件。
- **OpenGauss：单独适配。** 协议接近 PostgreSQL，不表示索引、扩展、查询和事务行为相同，不能直接套用 PG 实现。

最终是四个 provider、三组主要底层实现，而不是复制四套业务迁移任务；SeekDB 如出现真实差异再增加对应实现。

## 3. 当前代码与数据关系

### 3.1 当前行为

上游源码基线中，四个目标 provider 都只在检索库维护向量，全文查询由 `MongoFullTextStore` 执行 jieba 分词和 Mongo `$text` 查询。

| 模块 | 当前职责 |
|---|---|
| `packages/service/common/vectorDB/constants.ts` | 根据环境变量选择实际 provider |
| `packages/service/common/vectorDB/type.ts`、`controller.ts` | 统一向量读写，已有可选 `texts` 入参 |
| `projects/app/src/service/core/dataset/data/dataIndex.ts` | 生产向量写入入口，已经传递与向量一一对应的 `texts` |
| `projects/app/src/service/core/dataset/data/data.ts` | 提交主数据、维护旧 Mongo 全文，并协调向量替换和失败补偿 |
| `packages/service/core/dataset/data/textStore.ts` | 全文 Store 分发，当前缓存的是固定的选择结果 |
| `packages/service/core/dataset/search/defaultRecall/fullTextRecall.ts` | 全文召回、业务内容组装和后续融合的接入点 |
| `projects/app/src/migration` | 系统升级任务注册、状态、租约、断点、进度与失败重试 |

### 3.2 数据所有权与目标结构

Mongo 的实际业务集合为 `dataset_datas`，旧全文集合为 `dataset_data_texts`。前者保存权威业务内容，后者保存用于旧全文查询的分词结果。迁移不能误删业务集合，也不能把 `fullTextToken` 直接当成原文搬运。

关联关系：

```text
Mongo dataset_datas._id            = 业务数据块 ID
Mongo dataset_datas.indexes[].dataId = 检索库 modeldata.id
Mongo dataset_datas.indexes[].text   → （历史同义词版本处理）→ 外置分析器 → modeldata.fulltext_tokens
modeldata.vector                    = 已有向量，保持不变
```

`modeldata` 在既有 `id / vector / team_id / dataset_id / collection_id / createtime` 基础上增加可空词串列 `fulltext_tokens`（NULL 表示尚未回填，图片索引为空串）。全文索引由对应数据库管理，只按空格切词打分。

例如一条既有向量 `id=123`，回填时只补充其 `fulltext_tokens`，不分配新 ID、不重算向量、不创建不存在的向量行。

## 4. 各数据库的实现方案

| Provider | 词串字段 | 全文实现方向（分词均由 FastGPT 外置分析器完成） | 单独适配的重点 |
|---|---|---|---|
| PG | `fulltext_tokens TEXT NULL` | `pg_search` BM25，索引 `fulltext_tokens::pdb.whitespace`，查询 `fulltext_tokens ||| 词数组` | 扩展与 PG 主版本兼容、评分与过滤、建索引和 Top-K 执行计划 |
| OceanBase | `fulltext_tokens LONGTEXT NULL` | 原生 FULLTEXT、`WITH PARSER SPACE PARSER_PROPERTIES=(min_token_size=1)`、`MATCH AGAINST` | MySQL 模式、实际补丁版本、SPACE 解析器最短词长、DDL 锁影响、批量条件更新 |
| SeekDB | 同 OceanBase | 复用 OceanBase 实现，独立版本/分词签名 | 版本/解析器能力、SQL 差异、独立查询计划和集成验证 |
| OpenGauss | `fulltext_tokens TEXT NULL` | 7.0 的原生 BM25，对词串建索引，查询传入以空格连接的词 | 最低版本、表类型、BM25 内置分词对词串的处理（未实测）、查询算子与相关性排序 |

### 4.1 PG 的引擎选型门槛

PG 原生全文可完成基本功能，但历史上下文中的 GIN 高频词长尾问题尚未被充分解决，因此不能直接把 GIN 方案视为已验证的生产默认值。

首选评估 `pg_search`，先验证目标 PG 主版本、CPU 架构、pgvector 共存、中文分词、带业务过滤的 Top-K 与持续写入。通过后锁定扩展版本和配置，再确定生产 DDL；如未通过，继续使用旧全文读取并修订选型，不自动切换。

若最终采用 GIN，须明确分词扩展、生成列/表达式索引、排名规则，并通过同样的长尾和质量验收。`text_search TSVECTOR` 只在该方案需要时增加，不能先写死它再切换引擎。首期生产只维护一套已选定的 PG 全文实现。

### 4.2 版本与部署前置

- 当前仓库 PG 模板为 PG15/pgvector 0.8.0；所选全文扩展需与其实际镜像验证，不能只验证另一主版本。
- OceanBase 模板为 `4.3.5-lts`；IK 从 4.3.5 BP1 支持，需读取实际补丁版本并测试，不只匹配镜像标签。
- SeekDB 模板为 `1.0.1.0-100000392025122619`；历史记录中其他版本的集成结果不能代替当前目标版本验收。
- OpenGauss 模板为 `7.0.0-RC1`，BM25 从 RC2 引入；采用 BM25 需先升级并验证。RC1 传统全文方案如需保留，应另作明确兼容方案，不静默降级。
- 这些前置只约束新全文启用。存量部署准备失败时仍走旧全文路径，不能因新增扩展缺失就破坏原有向量服务。

### 4.3 参数管理

适配器代码固定分词器、停用词策略、评分和索引选项，记录 `schemaVersion` 与 `analyzerVersion`；不增加数据库高级参数的用户配置表单。各库只设置实际支持且验证过的参数，不强行统一 k1/b 或原生分数阈值。

变更分词配置可能需要重建全文索引，必须产生新的配置版本和验证记录。普通关键词相关性检索作为首期共同能力，不额外承诺跨库 AND/OR、短语和通配符查询语言完全一致。

### 4.4 外置分词（统一分析器）

四个 SQL provider 的原生全文统一采用 FastGPT 外置分词，Milvus/Zilliz 保持既有实现不变，Mongo 旧全文继续使用 `jiebaSplit` 普通切词模式。

- 分析器：`packages/service/common/string/jieba/index.ts` 的 `jiebaSearchTokens`。与 `jiebaSplit` 共用 `stripMarkdownAndUrl` 预处理与同一份停用词表（去掉 `# * _ ~ > [ ] ( ) { } |` 与 `http(s)://...` 网址、去全角标点；只剥离网址本身而不误删周围无空格中文、闭合符号后紧邻的英文数字或不带 `://` 的普通 `http/https` 词汇），切词采用 jieba **搜索模式**（输出重叠词，如“复旦 / 大学 / 复旦大学”），统一转小写后过滤停用词。
- 写入、回填、核对、检索四个环节共用同一个分析器：`common/vectorDB/fullText/analyzer.ts` 的 `toSqlFullTextTokens`（写库词串）、`toSqlFullTextQueryTerms`（查询词，去重）、`tokenizeSqlFullTextRows`（回填/核对）。查询清洗后没有可检索词时直接返回空结果，不访问数据库。
- 词典自检：jieba 实例加载后用关闭 HMM 的切词校验词典是否生效，失败直接报错，防止词典未加载时静默退化为纯 HMM 切词。
- 存储与版本：统一使用可空词串列 `fulltext_tokens` 与全文索引 `modeldata_fulltext`；首版元数据 `schemaVersion` 为 `1`，外置分析器签名为 `fastgpt-jieba-search-v1`，各 provider 的 `analyzerVersion` 为“数据库侧配置 + 该签名”。后续切词模式、词典、停用词或归一化任一变化都必须升级签名并进入新迁移代次，禁止静默混用。

**选型实测依据（100 万条 mMARCO 中文实测，1000 条查询，搜全部 100 万行）**：

| 候选方案 | Hit@10 | p50 / p99 | 8 并发吞吐 | 写入索引的词条 |
|---|---|---|---|---|
| 外置分词（jieba 搜索模式，选定方案） | 45.2% | 9.8 / 23.0 ms | 约 561 QPS | 4161 万 |
| 数据库内置分词对照（PG `pdb.jieba`，查询原样传入） | 46.0% | 145 / 177 ms | 约 68 QPS | 7580 万 |
| 外置普通分词对照（`jiebaSplit` 普通模式） | 46.5% | 7.8 / 18.4 ms | 约 806 QPS | 3548 万 |
| Mongo 旧全文基线 | 36.2% | 60 / 1157 ms | 约 39 QPS | — |

- 数据库内置 `pdb.jieba` 在百万级全量检索时慢，是因为内置分词不过滤空格、标点和“的/是”等高频停用词，查询带这些词就会匹配几十万篇文档；`pg_search` 0.26.6 的停用词选项不支持中文，无法在数据库内消除高频词长尾。
- 在中文短文档集（NanoMIRACL 中文，200 条查询）上，外置搜索模式 Hit@10 为 **84.50%**，而外置普通模式仅 **77.0%**（不输出重叠子词导致简称/全称漏召回，且缺少英文小写归一化），因此必须采用外置搜索模式。
- 准确率差异在抽样误差内（Hit@10 约 ±1.6 个百分点）；语料平均 117 字，真实知识库的绝对耗时会随文本长度变化。完整实验原始产物保存在仓库外本地评测目录，不提交进主仓库。

**已知局限与待验证**：

- 与 `jiebaSplit` 一致，ASCII 标点（如 `'`、`=`、`;`、`.`）会作为单独的词保留，`C#` 会变成 `c`、网址会被删除；这些词在英文为主的语料里可能重新带来匹配面过大的问题，未单独评估。
- OceanBase/SeekDB：SPACE 解析器默认 `min_token_size` 为 3，若按字符计会丢掉中文两字词，因此显式设为 1；该属性写法与 `SHOW CREATE TABLE` 输出格式均未在真实库上验证。
- OpenGauss：BM25 索引会再用内置分词处理词串，能否严格按空格切分未实测；写入与查询都经过同一内置分词，两侧一致，但效果需真实库验证。

## 5. 共用的业务代码改动

### 5.1 文本生成与业务写入

采用每条索引对应一行全文文本，原始输入来自已经规范化的 `indexes[].text`：

1. default、question、summary、自定义索引及图片描述文本使用同一生成规则。
2. `imageEmbedding` 保留向量，全文写空串，不写图片 URL、签名链接或对象存储 Key。
3. 新数据复用现有同义词变换上下文；历史数据按记录关联的同义词版本还原。历史版本无法确认时记录错误，不能直接套最新词表。
4. Mongo 旧全文继续沿用原有文本契约。旧路径主要按 Q/A 合并，新路径按索引检索，因此命中和排序差异必须单独验收。

业务层按当前迁移状态生成写计划，再把文本与向量传给适配器。适配器不读取 Mongo 路由状态，不导入 App 迁移模块。

- `legacy`：保留原向量 INSERT，维护 Mongo 旧全文；不引用尚未准备的文本列。
- `dual/ready/native`：新向量与文本在同一次检索库行写入中完成，同时在 Mongo 业务事务中维护旧全文。
- 复用既有向量 ID：dual 后须确认该行全文已就绪，缺失时条件补齐；不重新 embedding。输入变化时沿用生成新 ID 的替换流程。
- `finalizing/cleaned`：按清理屏障生效后的策略，仅维护原生全文。

写入顺序保持“写新向量与文本 → 提交 Mongo 主数据和索引引用 → 清理旧向量”。原生写入失败时本次业务写入失败；Mongo 提交失败时补偿新向量，残留由有效引用过滤与孤儿清理处理。SQL 数据库不参与 Mongo session，不能宣称跨库事务原子提交。

必须覆盖创建、Q/A 更新、独立索引增删改、复用 ID、同义词/模型重建、训练重试、集合替换，以及 data/collection/dataset/team 删除和 cron 清理。读路由改为原生库后，观察期仍维护旧全文写删。

### 5.2 原生全文接口与统一召回

为四个 SQL provider 定义单独的原生全文能力契约；不要为加入该能力而要求 Milvus 重写接口或迁移业务文档映射。

共用入参沿用 `FullTextSearchProps`：query、limit、teamId、datasetIds、集合 allow/forbid 列表。SQL 原生适配器返回 `{ vectorId, collectionId, score }`，Mongo 兼容路径保持现有业务 dataId 结果。

SQL 原生召回流程：

1. 适配器在数据库中应用归属与集合过滤，再执行全文相关性查询和 limit。
2. 业务层批量按当前 `indexes[].dataId` 映射，核对有效引用、归属、删除状态和可读范围，跳过孤儿行。
3. 按业务数据块去重保留最高分，复用回表内容组装结果，接入既有 RRF/rerank。

首轮候选倍率 2、总预算 500 仅作为待验证初值；limit 表示最多返回多少条去重业务数据。记录候选预算耗尽，不能为了补足数量无限扩展高频 OR 查询。

### 5.3 文件改动清单

| 路径 | 计划改动 |
|---|---|
| `packages/service/common/vectorDB/type.ts`、`controller.ts` | SQL 全文能力契约、逐行 texts 校验、原生查询与条件补文本的入口 |
| `packages/service/common/vectorDB/pg` | PG 的文本同写、全文查询、能力检查、条件补齐 |
| `packages/service/common/vectorDB/oceanbase`、`seekdb` | OB/SeekDB 兼容的基础实现及真实差异分支 |
| `packages/service/common/vectorDB/opengauss` | OpenGauss 文本同写、BM25 查询及版本/索引校验 |
| `packages/service/core/dataset/data/textStore.ts` | 分离具体 Store 与阶段路由；保留 Milvus 原有分支 |
| `packages/service/core/dataset/fullText/sql` | 拆分 `schema.ts`、`entity.ts`、`store.ts`，管理 SQL 全文就绪目标持久化与原生召回 |
| `projects/app/src/service/core/dataset/data/data.ts`、`dataIndex.ts` | 写计划、兼容期旧全文维护、复用 ID 补齐、回滚补偿 |
| `packages/service/core/dataset/search/defaultRecall` | SQL 原生命中映射、过滤、去重与正文组装；保持对外响应 |
| dataset/collection 删除、App cron | 按阶段维护旧全文，原生全文随向量行清理 |
| `projects/app/src/migration/registry.ts` 与 `tasks/<version>/...` | 注册手动触发升级任务 `20261110_migrate_sql_fulltext`（`manual: true`），编排准备、预检、回填、全量验收与切读激活 |
| global 业务契约与多语言 i18n | SQL 全文 provider / 元数据契约与升级任务多语言文案 |

新装与升级启动时各 SQL 向量控制器 `init()` 优先幂等补齐基础表、`fulltext_tokens` 列与向量索引，并在非阻塞 `try / catch` 中尝试创建全文扩展与全文索引，写入始终同行写向量与外置分词词串，同时在兼容期内继续维护 `dataset_data_texts` 双写/双删；只用于升级迁移的历史文本生成、扫描与恢复编排留在 App migration 目录。兼容期继续保留 `dataset_data_texts` 活动索引。

## 6. 运行期平滑切读与兼容期双写策略

运行期通过目标就绪记录 `dataset_sql_fulltext_targets` 控制 `SqlFullTextStore` 的平滑切读，并在兼容窗口内保留 Mongo `dataset_data_texts` 双写/双删与 `$text` 读取兜底：

- **新装与升级启动**：应用启动执行对应向量库 `init()` 时先建好基础 `modeldata` 表、`fulltext_tokens` 列和向量索引，再以非阻塞方式尝试创建全文扩展与全文索引（旧镜像缺扩展时仅记录 `warn`，不阻断应用启动与向量服务）；后续新写入同行写向量与词串，同时继续维护 `dataset_data_texts`。
- **平滑切读**：`20261110_migrate_sql_fulltext` 在 `prepare` 阶段先清理当前 provider 的就绪标记，仅当 `prepare → preflight → scan → validation` 全量通过后，才将当前 SQL 目标的 `{ provider, targetId, schemaVersion, analyzerVersion }` 写入 `dataset_sql_fulltext_targets`。`SqlFullTextStore.search()` 在目标已就绪且签名匹配时走 `searchSqlFullText()`，否则自动回退 `MongoFullTextStore.search()`（Mongo `$text`）。
- **目标身份保护**：目标 SQL 库内部通过 `fastgpt_fulltext_metadata` 持久化 `{ targetId, schemaVersion, analyzerVersion }`，既供升级任务的 checkpoint 绑定物理目标与分词签名，也供运行期核对当前连接的物理目标是否已完成回填与校验。

## 7. 系统迁移任务如何共用

复用现有迁移框架，注册单个手动确认触发任务，目录使用 `tasks/4180/20261110_migrate_sql_fulltext/`：

| 任务 ID | 模式 | 阶段 | 职责 |
|---|---|---|---|
| `20261110_migrate_sql_fulltext` | 手动触发任务（`manual: true`） | `prepare → preflight → scan → validation` | 待旧写入方排空后校验并准备目标 SQL 全文结构、全量只读预检、按游标幂等回填历史词串、全量校验通过后激活目标就绪标记平滑切读 |

任务声明 `manual: true`（不设 `blockStartup` 或 `independent`），初始为 `waiting`，待管理员确认集群所有旧版节点和训练消费者升级排空后入队执行，支持租约续期与分批断点续跑；恢复重跑时重新校验完整范围并安全补齐旧游标前重新出现的 `NULL` 行。

每个任务入口只分发当前 SQL provider：共用扫描、错误、checkpoint 与阶段逻辑，调用对应数据库的底层函数。Milvus / Zilliz 等不适用部署只按框架完成不适用说明，不执行目标 DDL、回填或旧数据清理；以后换 provider 必须另走明确的迁移代次，不重置已成功任务。

数据库差异函数放在同版本共享迁移目录：

| 迁移操作 | PG | OceanBase / SeekDB | OpenGauss |
|---|---|---|---|
| 检查前置 | PG/扩展/架构及权限 | 实际版本、租户模式、IK 与属性 | 版本、表类型、BM25 能力 |
| 准备 DDL | 文本列、选定扩展索引 | 文本列、FULLTEXT/IK 属性 | 文本列、BM25 索引 |
| 只读预检 | 同归属行存在；允许 NULL，非 NULL 正文一致 | 同归属行存在；二进制正文比较并允许 NULL | 与 PG 共用只读条件查询 |
| 条件回填 | PG 参数占位与批量 UPDATE | MySQL 参数占位与批量 UPDATE | 经 OpenGauss 验证的 UPDATE |
| 结果校验 | 扩展索引状态及查询计划 | 索引元数据、分词及查询计划 | BM25 元数据、查询算子及计划 |

业务层只判断“准备、回填或校验成功与否”，不把数据库 SQL 差异散落到上层业务代码。

## 8. 迁移执行步骤

### 8.1 准备与开启双写

1. 发布兼容版本，保持 legacy 读取和原有写入，新增文本列默认 NULL，不破坏旧版本向量 INSERT。
2. 完成扩展或数据库版本准备，执行 prepare：校验版本、权限、磁盘及 DDL 锁影响，幂等增加文本列和全文索引。重型 DDL 不放进普通请求或无条件启动流程。
3. 准备成功后启用 dual。新代码同写原生文本与向量，Mongo 旧全文继续在业务事务中维护。
4. 核对并升级全部 App、训练 worker、同步与相关 Pro 写入方，等待旧进程和在途事务退出，再触发 backfill。

准备失败继续使用旧全文；不把原生能力缺失当作“已成功但结果为空”。如 DDL 需重启或离线执行，提前安排对应维护操作，不承诺零阻塞。

### 8.2 分批扫描与恢复

每次执行 backfill（含失败重试、取消恢复、lease 接管）均先重新全量只读预检：确认目标身份与全文能力，逐条还原 Mongo 当前有效引用及历史正文，核对向量行存在、团队/知识库/集合归属和已有正文。NULL 是正常待回填状态；缺失行、归属冲突、非 NULL 正文冲突、非法 ID/文本或缺失历史同义词快照均阻断回填。预检仍会分批扫描收集错误，错误快照达到 1,000 项则提前失败；不修复业务数据。

预检游标不持久化为“已通过”证明，重试必须从头检查；只有当前预检无未解决异常才进入历史回填。已保存的 scan/validation 断点及错误保留，错误按阶段和业务 ID 分开管理，避免预检通过误清除待回填错误。准备阶段 DDL 和业务 dual 写入独立于历史回填；预检失败不撤销已完成批次或 DDL，但本次不会新增历史回填。

首次回填在确认 dual 生效后记录 Mongo 当前范围 `_id` 上界 `endDataId`，按稳定 `_id` 升序扫描。断点包含 targetKey、范围版本、endDataId、lastDataId、校验阶段游标及有限计数，禁止 offset 分页和保存正文。

使用框架 `systemMigrationBatchSize`，当前默认 100、允许 50～1000。一个 Mongo 文档可有多个索引，展开后按条数与总字节再拆批，避免 SQL 参数数、包大小和内存失控。

上界之后以及游标已经越过位置的新写入由 dual 保证。复用未回填旧 ID 的新业务操作也要条件补文本，不能把完整性责任完全留给一次历史扫描。

### 8.3 单批实际做什么

1. 检查 lease、signal、dual、目标身份和前置任务；读取业务 ID、归属、索引、同义词版本和并发校验字段。
2. 展开为 `{ vectorId, teamId, datasetId, collectionId, expectedText }`，按统一规则处理文本、图片与历史同义词。
3. 核验目标向量行存在且归属相同，只更新该行缺失的全文；不 INSERT/UPSERT，不改变向量、ID、归属及清理时间。
4. NULL 表示未回填，空串是已处理的有效文本。已有非 NULL 文本先核对预期内容，不用旧快照覆盖新值。
5. 再核对 Mongo 当前引用与版本：旧 ID 已替换或业务数据已删除时分类为失效引用；当前有效行仍缺向量、归属冲突或文本冲突时记录失败。
6. 确认写入及可读结果；更新完整失败快照后再保存本批断点，最后上报进度。

PG 条件更新的示意如下，实际批量写法由该 provider 实现；参数来自经过校验的关联，不拼接用户文本：

```sql
UPDATE modeldata
SET fulltext_tokens = $1
WHERE id = $2
  AND team_id = $3
  AND dataset_id = $4
  AND collection_id = $5
  AND fulltext_tokens IS NULL
RETURNING id;
```

OceanBase / SeekDB 使用对应驱动参数及结果检查；OpenGauss 使用经该版本验证的语法。更新影响零行时要区分“已就绪、已删除、归属不符、实际缺失”，不能直接全部计作成功。

### 8.4 并发安全与失败重试

必要不变量：有效向量 ID 对应固定索引输入，输入变化生成新 ID。实现前核对所有修改路径；存在原地改文本却复用 ID 的路径时先修正，不能只靠写前读一次 Mongo 来解决竞态。

- 回填与删除并发：只 UPDATE 既有向量行，不复活已删除行；失效引用不能成为有效召回。
- 回填与更新并发：按 ID 条件补 NULL 文本，不覆盖新行；业务引用切换后的旧行由原有清理机制回收。
- 原生写入成功、Mongo 失败：执行既有补偿；有效引用检查兜底过滤残留。
- 进程崩溃或重复执行：已填文本核对后计为就绪，未保存断点的批次可安全重放。
- 重试：重新全量只读预检，通过后优先处理对应阶段上次错误，再从 checkpoint 续跑；仍有未解决错误不得标记成功。

每批通过 `context.assertActive()` 验证执行权，失败快照先于对应 checkpoint 保存。限制错误快照大小，到上限时结构化失败等待修复。任务返回前完成所有声明阶段，由 Runner 提交 succeeded；脚本不直接改系统任务状态。

### 8.5 完成校验

完整性按**当前有效引用集合**检查：每个有效非图片索引都有归属和文本正确的向量行；图片全文为空；目标全文索引有效且查询可见。待训练、失败记录及失效引用分别统计，不用孤儿行凑数量。

在线删除会改变数据量，初始 count 仅用于进度估计，不机械要求最终表总量相等。覆盖检查全量分批执行并可续跑，效果与性能另用样本验证。

新增空部署在明确检查权威源为空后可快速完成任务；复用 Mongo 或恢复备份的部署不能仅因目标表为空跳过。任务成功后若验收发现缺陷，走修复入口或追加修复任务，不篡改已发布任务语义或重置旧成功状态。

## 9. 切换读取、回退与旧数据清理

### 9.1 切换与观察

回填 succeeded、目标身份一致、未解决错误为零、全写入方已升级，并且关键查询、权限、增删改、相关性与性能通过验收后，管理员将 ready 切为 native。

观察期继续双写。监控错误率、延迟分布、超时、有效引用映射失败、候选预算耗尽、写入失败及索引状态。可以限流执行影子查询，但必须计入额外资源成本。

发现问题时将 native 切回 dual：恢复旧全文读取，保留新结构，无须反向搬运数据。回退后作废本次切换验收，修复、重新验证后可再次切换。禁止每个原生查询出错就静默回 Mongo。

观察期覆盖有代表性的业务周期，并由实际结果决定何时结束；保留旧集合但停止更新不能提供完整回退。兼容版本回滚保留新增列，清理后不能直接回滚到依赖旧全文的应用版本。

### 9.2 结束回滚窗口与清理

cleanup 是独立手动任务。首期通过**短暂暂停知识库写入并排空在途操作**建立清理屏障，读取继续服务；不把整个历史回填设为全站启动阻塞任务。

1. 确认回填任务、目标身份、观察期验收和清理范围，显式结束直接回退窗口。
2. 关闭知识库写入口并暂停训练/同步等生产者；共同写闸门跟踪并排空全部在途写入与 Mongo 事务，确认旧版本写入方退出。
3. 所有写入节点确认新 revision 后进入 finalizing，之后只维护原生全文。入口遗漏或节点无法确认时拒绝删除，固定等待几分钟不算排空。
4. 恢复知识库写入并验证新写删不会再生成旧全文记录，再按排空后冻结的范围分批删除 `dataset_data_texts`，范围覆盖双写期间新增知识库。
5. 校验旧记录为零且无再生后进入 cleaned。中途失败保持 finalizing 并断点续跑，不重新开放直接回退。

不删除 `dataset_datas`、Q/A、索引原文、同义词记录、向量或文件。共享 Mongo 按确认的 teamId/datasetId 范围清理，不能无条件 `deleteMany({})` 或 drop，不能影响其他部署及未迁移范围。

兼容期继续声明旧 Mongo 全文活动索引，不提前标记 deprecated。全部适用范围 cleaned、没有旧版本和兼容读写方后，再在后续发布中移除模型依赖并登记确认废弃的 FastGPT 索引，补 indexManager 清理测试；不处理客户自建索引。

清理后若要恢复 Mongo 全文，必须从业务原文重建、追平增量并重新验证；不能只切回读取开关。重启或清理接管后也需重新验证写闸门和原生写策略。

## 10. 测试与验收

### 10.1 正确性和恢复能力

| 范围 | 必测内容 |
|---|---|
| 四个数据库独立集成 | 实际版本、扩展、分词、索引状态、查询可见性和不支持能力的错误 |
| 文本与召回 | 中英文、专业词、型号、标点、空文本、图片空全文、过滤、有效 ID 映射、去重与候选预算 |
| 业务操作 | 创建/修改/删除、独立索引操作、复用 ID、同义词/模型重建、训练重试、集合替换与各层删除 |
| 迁移竞态 | 回填并发更新/删除、文本冲突、部分失败、Mongo 回滚、lease 丢失、提交后断点前退出 |
| 恢复和切换 | 首次与重复运行、错误优先重试、断点续跑、旧读双写、拒绝提前切读、观察期切回 |
| 清理边界 | 全写入方排空、旧记录不再生、共享范围隔离、清理续跑、清理后禁直接回退 |
| 非目标 provider 回归 | Milvus / Zilliz 原有读写与迁移保持原行为，不进入 SQL 清理路径 |

### 10.2 质量与性能

先冻结 50 条覆盖高频词、短实体、否定词、长句、型号和过滤条件的中英文查询，用于选型及慢查询诊断，保存返回文档 ID、耗时和错误。不能用返回条数代替准确率，不能以只保留最长 3 个词后的速度代表原查询性能。

当前 PG 迁移精度回归固定为中文、英文、日语六组：C-MTEB CovidRetrieval、BEIR SciFact/NFCorpus、NanoMIRACL zh/en/ja，均使用固定输入哈希和完整发布标注。按数据集分别统计 Hit@10、MRR@10、nDCG@10，并断言 PG 不低于同批 Mongo 基线；不合并不同候选库的绝对精度。

性能区分全文数据库阶段和包含 Mongo 回表的应用阶段，覆盖窄/宽知识库范围、单/目标并发、冷暖缓存和持续写入；锁定语料、文本规则、CPU/内存与超时，采集 P50/P95/P99、成功吞吐、超时、索引体积及峰值资源。

历史 FAQ 数字没有在本轮定位到原始数据与报告，不纳入验收证据；历史上下文中另一工作区的通过声明也需要原始代码和产物复核。PG 专项已核验并重新执行仓库内中文、英文、日语六组用例，含完整发布的 100,001 条中文语料和对应标注。T²Ranking、MS MARCO 未执行，不纳入已验证范围。

局部单测和真实数据库集成测试留在 FastGPT；大规模语料、评测脚本及报告优先放独立 benchmarks 仓库和外置缓存，不把大数据文件提交进主仓库。仅运行改动影响范围的检查，用户最终验收前不主动跑完整仓库测试。

## 11. 实施顺序与待冻结项

| 顺序 | 交付物 | 放行条件 |
|---|---|---|
| 1 | 锁定版本、PG 引擎、文本/同义词规则、首次发布信息 | 能安装、能正确检索；冻结生产 DDL 与任务 ID |
| 2 | 四 provider 的原生全文与文本同写、统一召回 | 各目标版本真实数据库集成通过 |
| 3 | 阶段路由、兼容双写、切换管理及写闸门 | 写入入口完整，旧路径可用，切换与回退通过 |
| 4 | 准备、回填、清理任务 | 幂等、断点、失败恢复及竞态演练通过 |
| 5 | 质量/性能验证与目标部署迁移 | 满足事先确定的业务阈值后切读和观察 |
| 6 | 独立清理及后续旧模型退役 | 观察期结束、排空前置满足、明确关闭回退 |

已确定的是整体流程、复用/适配边界和数据安全原则。PG 首轮实现采用 pg_search 0.26.6，生产引擎冻结仍需正式规模验证；其余数据库的锁定版本、历史异常数据修复及最终发布信息仍需确认；切换前需确定业务延迟、超时、质量阈值和观察期，并提供实际验证结果。本文不虚构当前 SLO 或固定 QPS。

## 12. 当前实现与逐库验证安排（2026-11-10）

### 12.1 已实现范围

| Provider | 全文代码 | 向量与全文同写 | 迁移编排 | 真实迁移效果 |
|---|---|---|---|---|
| PG | 外置分词词串、pg_search 0.26.6 `pdb.whitespace`、BM25 | 已接入（始终同行写入） | 共用手动触发任务 `20261110_migrate_sql_fulltext` | 真实 PG 迁移/恢复、本地业务库 6,097 条迁移校验、100 万条检索与中英日六组语料准确率已实测（见 4.4、12.6） |
| OceanBase | 外置分词词串、FULLTEXT SPACE 解析器、自然语言匹配 | 已接入 | 同上 | 已完成 OceanBase 4.3.5.5 真实容器迁移与检索集成验证 |
| SeekDB | 复用 OceanBase 实现，独立版本/分词签名 | 已接入 | 同上 | 已完成 SeekDB 1.0.1.0 真实容器迁移与检索集成验证 |
| OpenGauss | 外置分词词串、DataVec BM25、原生排序算子 | 已接入 | 同上 | 已完成 openGauss 7.0.0-RC2 真实容器迁移与检索集成验证 |

Milvus/Zilliz 保留原生全文路径，不进入 SQL 迁移。Mongo 仍是业务原文和当前有效索引引用的权威来源。

统一升级任务为 `20261110_migrate_sql_fulltext`（`manual: true`），登记于 4.18.0（阶段：`prepare → preflight → scan → validation`）。`getFullTextStore()` 在非 Milvus 下返回 `SqlFullTextStore`（继承 `MongoFullTextStore`）：迁移完成并写入 `dataset_sql_fulltext_targets` 前回退 `MongoFullTextStore.search()`，完成后平滑切读至 `searchSqlFullText()`。checkpoint 绑定 provider、物理目标 UUID 与 `analyzerVersion`。

四库共用历史文本规则、断点恢复、失败重试和业务 ID 映射。MySQL 协议写入使用绑定参数及 utf8mb4，逐行获取精确自增 ID，不推算连续 ID，也不改写正文中的引号。运行期业务写删在同行维护 SQL `fulltext_tokens` 的同时，兼容期内继续维护 `dataset_data_texts` 双写/双删及其索引，保障升级回退与共享/未切换目标的平滑检索。

同一个 Mongo 业务库内，每个 provider 当前只绑定一个物理目标；同 provider 的多个独立检索实例共享该业务库尚未实现范围隔离。切换 provider 或恢复不同时间点的备份仍需独立迁移代次，不能直接沿用旧成功状态。

### 12.2 数据库支持版本与启用前提

支持条件必须包含数据库产品/版本、扩展或全文引擎、分词配置、表结构约束和实际验证状态。能存储文本、能做向量检索，均不能替代全文检索能力；仅达到版本号也不能代替真实索引能力检查。

下表是当前适配代码的接入门槛，不是厂商所有全文功能的最低版本，也不代表该范围所有补丁版本和平台都已实测。未经验证的更高大版本不能直接视为兼容。

| Provider | 当前代码版本门槛 | 必需能力/配置 | 真实验证状态 |
|---|---|---|---|
| PG | PostgreSQL15.19 起的 15.x；pg_search 精确为 0.26.6 | 匹配当前 PG/平台的扩展二进制、预加载 pg_search；`fulltext_tokens::pdb.whitespace` 的 ParadeDB 索引定义及有效性通过检查 | 已验证 PG15.19 + pgvector0.8.0 + pg_search0.26.6（Linux ARM64 与 x86_64）；其他组合未实测 |
| OceanBase | 产品版本至少 4.3.5.1（沿用原代码门槛） | MySQL 模式；SPACE 解析器且 `min_token_size=1`；有效且可见的 FULLTEXT 索引，utf8mb4 词串列 | 单测已覆盖门槛和能力检查，真实迁移待实测 |
| SeekDB | 产品版本至少 1.0.1 | FULLTEXT、SPACE 解析器、utf8mb4；检查产品版本，不能拿 MySQL 协议版本号替代 | 单测已覆盖门槛和能力检查，真实迁移待实测；不将该数字宣称为厂商最早支持全文的版本 |
| OpenGauss | 7.0.x，至少 RC2；必须实际存在 DataVec BM25 | 普通 astore 行表、单列 nullable 词串索引，以及预期 BM25 查询计划 | 单测已覆盖门槛和能力检查，真实迁移待实测 |

PG 自身已有内置全文能力，详见 [PG15 全文文档](https://www.postgresql.org/docs/15/textsearch.html)。这里的 PG15.19/pg_search0.26.6 限制属于当前适配和已验证二进制组合，不能表述为“PG15.19 才开始支持全文”，也不能据此认定 PG16/17/18 不具备全文能力。扩展发布产物见 [pg_search0.26.6](https://github.com/paradedb/paradedb/releases/tag/v0.26.6)。

OceanBase IK 及分词属性的 4.3.5 BP1 前提见 [官方 CREATE INDEX 说明](https://docs.oceanbase.com/oceanbase-database/V4.4.2-create-indexes-mysql-compatible-mode)；OpenGauss 的 RC2、astore 与 text 约束见 [官方 BM25 说明](https://docs.opengauss.org/zh/docs/7.0.0/datavec/bm25_full_text_search_index.html)。生产发布前仍需用真实产品版本字符串及部署构建验证当前门槛。

Milvus/Zilliz 沿用既有原生全文路径，不进入 SQL 迁移；现有 Milvus 实现的代码门槛为 2.5.16+，仍需满足 BM25/analyzer 等能力，本次不调整其版本或迁移方案，不将其列为本轮已复测。

兼容性校验的实际顺序为：`20261110_migrate_sql_fulltext` 的 `prepare` 阶段先清除当前 provider 就绪标记，检查数据库版本与必需扩展/构建，再准备字段和索引并核对实际能力；版本或能力不满足时任务直接失败，不开始历史回填，也不激活切读，继续保持 Mongo `$text` 兼容读取。准备阶段已成功执行的追加 DDL 可能保留，不能把“任务失败”理解为各库所有 DDL 都会自动回滚。

`schemaVersion` 表示 FastGPT 全文元数据结构版本，`analyzerVersion` 表示文本与分词规则，均不是数据库产品版本。目标 UUID 用于升级任务 checkpoint 的物理目标身份绑定；数据库版本及其扩展版本由 `prepare` / `assertCapability` 单独核验，不能混用。

原本地 PG15.14 加载本次 pg_search 二进制时报 `undefined symbol: pg_mblen_cstr`；上一轮验证环境为 PG15.19 + pgvector 0.8.0 + pg_search 0.26.6，Linux ARM64。原业务库、镜像与部署 YAML 没有改动。

文本统一按 UTF-8 字节检查，单条上限 1 MiB，拒绝 NUL，超过契约明确报告而不截断。回填同时按最多 50 行及约 1 MiB 文本拆批。OceanBase/SeekDB 新文本列使用 utf8mb4 LONGTEXT；已有列必须可空且具有相应字符集和容量，不能误把 64 KiB TEXT 当作支持 1 MiB。

### 12.3 已有证据与验收边界

已编写适配器和共同迁移流程的局部测试，覆盖版本检查、索引属性、绑定参数、归属过滤、大整数 ID、部分写入失败、四 provider 共用路由/断点和故障回退。

四库代码适配阶段局部回归 193 项通过；该阶段统一真实数据库用例因未配置实例而跳过。后续 PG 专项已实测通用入口和恢复用例，详见 12.6。App 类型检查、改动文件 ESLint、Prettier 与四语言迁移文案键检查通过。

上一轮 PG 单库实现已在真实 PG 与隔离 Mongo 副本集演练中断续跑、并发增删改、Mongo 事务回滚、孤儿过滤、切读与回退。另外从旧库只读抽取了 200 条业务数据、214 条向量和 200 条旧全文记录：副本回填后原文、向量、ID、归属、创建时间与旧全文逐项一致，20 条自检索查询新旧均能在 Top10 找回原数据。

这些小规模结果不代表全部数据库效果已验证，也不是正式问答准确率或百万级性能基准。统一化后的数据库需分别验收；后续 PG 专项已在隔离库实测公开语料，但本地业务数据因预检异常停止，不能视为业务全量迁移通过。不删除旧全文。

### 12.4 统一真实数据库演练入口

入口为 `projects/app/test/migration/tasks/4180/20261110_migrate_sql_fulltext/database.integration.test.ts`。设置 `FASTGPT_SQL_FULLTEXT_TEST_PROVIDER` 与 `FASTGPT_SQL_FULLTEXT_TEST_URL`，同一套用例依次执行旧数据入库、手动入队触发真实 Runner 迁移、快照比较、旧 Mongo 全文兼容保留校验、已知查询与增量同写校验。

```bash
FASTGPT_SQL_FULLTEXT_TEST_PROVIDER=pg FASTGPT_SQL_FULLTEXT_TEST_URL=postgresql://fulltext_test:fulltext_local_test@127.0.0.1:15433/fulltext_test pnpm test projects/app/test/migration/tasks/4180/20261110_migrate_sql_fulltext/database.integration.test.ts
```

provider 可选 `pg/oceanbase/seekdb/opengauss`；PG/OpenGauss 使用 PostgreSQL 协议 URL，OceanBase/SeekDB 使用 MySQL URL。仅允许显式 localhost 测试实例，连接串数据库名须以 `fulltext_test` 开头，不读取普通业务连接变量。

用例创建并只回收本次专属 schema 或数据库，Mongo 由测试框架隔离。MySQL 测试账号需能创建/删除测试数据库，PG/OpenGauss 账号需能创建 schema；扩展与目标数据库先按上表准备。未配置时跳过，不计作真实数据库测试通过。

PG 的专项恢复用例仍保留在同目录 `service.integration.test.ts`，使用 `FASTGPT_PG_FULLTEXT_TEST_URL`。测试镜像可用 `packages/service/test/integrations/vectorDB/pg/Dockerfile.fulltext` 构建；不会替换业务部署镜像。正式验收还需补齐真实问题标注、目标规模性能及各库故障恢复矩阵。

### 12.5 升级切读与兼容期行为

1. 服务启动时，所选 SQL 向量库控制器 `init()` 自动确保基础表、`fulltext_tokens` 列及向量索引存在，并以非阻塞方式尝试创建全文扩展和全文索引；升级后的新向量写入同行携带分词词串，同时在兼容期内继续维护 Mongo `dataset_data_texts` 双写/双删。
2. `20261110_migrate_sql_fulltext` 初始处于 `waiting`（待手动执行），期间检索继续走旧 Mongo `$text`。待管理员确认集群所有旧版节点与训练消费者已升级排空后点击执行，任务先通过 `prepare` 与 `assertCapability` 校验数据库版本、扩展和索引定义，再执行全量只读预检、分批回填历史 `NULL` 词串与全量一致性校验，全部通过后写入 `dataset_sql_fulltext_targets` 平滑切读；旧 `dataset_data_texts` 表与索引留待后续版本独立任务退役清理。
3. 若数据库版本/扩展不满足或存在脏引用/非法向量 ID/非法文本，任务在对应阶段阻断切读并记录可定位 `dataset_datas._id` 的失败明细，管理员修复后通过标准升级页面重试。

### 12.6 PG 专项迁移与中英日六组公开语料回归验证

仓库内固定回归入口为 `projects/app/test/migration/tasks/4180/20261110_migrate_sql_fulltext/quality.integration.test.ts`，数据清单与输入 SHA-256 固定在同目录 `quality.datasets.json`，下载与规范化脚本为 `prepare_quality_data.py`。覆盖中文、英文、日语共 6 组公开数据集（114,020 条文档行、2,172 条标注查询），依次执行真实迁移 Runner（准备、全量只读预检、回填、全量后验与切读激活）、数据完整性指纹校验、`VACUUM (ANALYZE)` 维护及检索准确率评测。

| 语言 / 数据集 | 文档 / 标注查询 | Hit@10：Mongo → PG | Hit@10 变化 | MRR@10：Mongo → PG | nDCG@10：Mongo → PG |
|---|---:|---:|---:|---:|---:|
| 中文 / C-MTEB CovidRetrieval | 100,001 / 949 | 84.30% → 89.36% | +5.06 pp | 0.6531 → 0.7464 | 0.6989 → 0.7817 |
| 中文 / NanoMIRACL 中文 | 1,700 / 200 | 74.00% → 84.50% | +10.50 pp | 0.3623 → 0.3865 | 0.4523 → 0.4953 |
| 英文 / BEIR SciFact | 5,183 / 300 | 71.67% → 80.67% | +9.00 pp | 0.5505 → 0.6419 | 0.5797 → 0.6711 |
| 英文 / BEIR NFCorpus | 3,633 / 323 | 65.63% → 69.35% | +3.72 pp | 0.4898 → 0.5213 | 0.2897 → 0.3133 |
| 英文 / NanoMIRACL 英文 | 1,657 / 200 | 93.00% → 95.50% | +2.50 pp | 0.5190 → 0.5710 | 0.6172 → 0.6629 |
| 日语 / NanoMIRACL 日文 | 1,846 / 200 | 49.50% → 89.50% | +40.00 pp | 0.2654 → 0.4823 | 0.3205 → 0.5805 |

六组全量预检、回填和后验后，有效全文 NULL 为 0、词串与归属冲突为 0，业务原文、旧 Mongo 全文、向量、ID、归属及创建时间的指纹前后一致；全部六组的 PG Hit@10、MRR@10、nDCG@10 均高于同批 Mongo 基线。

复现方式（须使用显式隔离的本地 `fulltext_test`PG15.19 + `pg_search` 0.26.6 与 Mongo 副本集，测试镜像可由 `packages/service/test/integrations/vectorDB/pg/Dockerfile.fulltext` 构建）：

```bash
python3 -m pip install pyarrow==21.0.0
python3 projects/app/test/migration/tasks/4180/20261110_migrate_sql_fulltext/prepare_quality_data.py \
  --cache-dir /tmp/fastgpt-pg-quality-cache

FASTGPT_TEST_MONGODB_URI='mongodb://127.0.0.1:27027/fulltext_test?replicaSet=fulltexttest' \
FASTGPT_PG_FULLTEXT_TEST_URL='postgresql://fulltext_test:fulltext_local_test@127.0.0.1:15433/fulltext_test' \
FASTGPT_FULLTEXT_EVAL_DATA_ROOT='/tmp/fastgpt-pg-quality-cache/datasets' \
FASTGPT_FULLTEXT_EVAL_OUTPUT_DIR='/tmp/fastgpt-pg-quality-results' \
NODE_OPTIONS='--max-old-space-size=4096' \
pnpm test projects/app/test/migration/tasks/4180/20261110_migrate_sql_fulltext/quality.integration.test.ts
```

此外，对本地只读抽样的存量业务数据预检时，发现两条历史业务数据的 4 个有效索引引用缺失对应 PG 行，预检按设计阻断迁移并保留原数据，验证了异常引用阻断机制。回填会产生旧行版本并影响 BM25 统计，正式上线流程应补充回填后的 `VACUUM (ANALYZE)` 维护步骤再执行切读验收。

## 13. 参考依据

数据库能力依据只用于版本与功能判断，不代表本方案已完成性能验证：

- [PG15 全文查询与排名](https://www.postgresql.org/docs/15/textsearch-controls.html)、[pgvector 混合检索](https://github.com/pgvector/pgvector#hybrid-search)。
- [ParadeDB 实现](https://github.com/paradedb/paradedb)及[发布产物](https://github.com/paradedb/paradedb/releases)：PG 主版本、扩展版本及平台需按目标环境锁定。
- [OceanBase 4.3.5 全文索引及 IK](https://www.oceanbase.com/docs/common-oceanbase-database-cn-1000000002015436)、[SeekDB 官方说明](https://www.seekdb.ai/)。
- [OpenGauss BM25 版本及限制](https://docs.opengauss.org/zh/docs/7.0.0/datavec/bm25_full_text_search_index.html)。
- [T²Ranking 数据与标注](https://github.com/THUIR/T2Ranking)、[MS MARCO Passage 数据与标注](https://microsoft.github.io/msmarco/Datasets)。

## 14. 待办

- [x] 实现四种 SQL 库的原生全文、同写、业务 ID 映射与双写期状态路由。
- [x] 注册统一准备/回填任务，支持条件回填、失败快照和断点恢复。
- [x] 正式回填接入全量只读预检，失败阻断历史写入；四 provider 共用，重试与恢复重新预检。
- [x] 完成 PG 真实数据库迁移、并发更新/删除、业务增删改、切换与故障回退演练。
- [x] 用 200 条本地旧业务数据和 214 条向量的隔离副本核对迁移完整性。
- [x] 同步四种语言的统一迁移文案，补充局部测试与逐库实测入口。
- [ ] 冻结四 provider 的生产版本与默认配置，完成正式规模的 PG 选型验收。
- [ ] 将当前版本、要求版本和能力检查结果接入只读预检展示，保持与适配器校验一致。
- [x] 补齐 OceanBase、SeekDB、OpenGauss 代码适配并收敛共同编排。
- [ ] 完成各库真实业务数据全量迁移；PG 隔离公开语料及恢复验证已完成，本地业务数据因缺失引用阻断，其他库待实测。
- [ ] 恢复 PG 两条业务数据的缺失引用，补充回填后维护步骤并再次执行业务副本验收。
- [ ] 覆盖全部 API、训练、同步、索引操作和 Pro 写入方的清理闸门。
- [ ] 确定最终发布版本与永久任务 ID，注册独立清理及后续修复/复验任务。
- [ ] 完成多目标共用 Mongo 的迁移范围隔离与完整回退后再上线流程。
- [x] 固定并执行中文、英文、日语六组公开精度回归，数据与结果均有哈希。
- [ ] 完成真实业务查询、目标规模性能与资源验收。
- [ ] 完成可恢复备份与恢复演练，再发布兼容版本并按阶段迁移。
- [ ] 观察期验收后再开放独立清理，最后退役旧模型和索引。
- [ ] 若需要替换业务数据库镜像或修改部署 YAML，先取得明确确认；当前仅保留隔离测试 Dockerfile，没有修改部署配置。
- [x] 四个 SQL provider 统一接入外置分词（`jiebaSearchTokens` 搜索模式 + 网址/Markdown 清洗 + 小写 + 停用词过滤 + 词典自检）：只存词串（`fulltext_tokens`），写入/回填/核对/检索共用分析器签名 `fastgpt-jieba-search-v1`（`schemaVersion: 1`，索引名 `modeldata_fulltext`）。
- [x] PG 单测、App 迁移与 OpenAPI 契约单测、真实 PG 迁移/恢复集成测试、100 万条吞吐评测及中英日六组公开语料精度回归全部通过（PG Hit@10 / MRR@10 / nDCG@10 均高于同批 Mongo 基线）。
- [ ] 在真实 OceanBase/SeekDB 上验证 SPACE 解析器、`min_token_size=1` 写法及 `SHOW CREATE TABLE` 输出与能力检查一致。
- [ ] 在真实 OpenGauss 上验证 BM25 对词串的切分与召回效果。
- [ ] 评估 ASCII 标点词（`'`、`=`、`;` 等）对英文语料匹配面和耗时的影响，必要时作为新分析器版本处理。
