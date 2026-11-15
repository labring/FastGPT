# SQL 向量库全文检索与存量回填

> 更新：2026-11-15。范围：PG、OceanBase、SeekDB、OpenGauss；Milvus/Zilliz 保留现有路径。
> 全文统一按 `index.text` 构建。读写配置、迁移完整性和数据库能力分别管理，不维护额外的结构版本或 provider 专属分词版本。

## 1. 目标与边界

在既有 `modeldata` 向量行中维护外置分词词串，复用向量 ID、归属及删除生命周期。Mongo `dataset_datas` 仍是正文和有效索引引用的权威来源；健康向量不重新 embedding，仅为确认物理缺失的有效引用生成新向量和全文，并替换对应 Mongo 引用，正文保持不变。

```text
Mongo dataset_datas._id             = 业务块 ID
Mongo dataset_datas.indexes[].dataId = modeldata.id
index.text → 对应历史同义词处理 → 统一分析器 → modeldata.fulltext_tokens
```

`fulltext_tokens IS NULL` 表示未回填；图片向量的全文词串为空串。检索库不额外保存业务原文。

新写入通过向量通道将向量和词串同行提交，随后在 Mongo 事务中写主数据及兼容全文；两个数据库之间没有分布式事务。SQL 查询结果须按 Mongo 当前有效引用核对，孤儿及已替换的旧向量不能成为有效业务命中。

## 2. 两个运行配置

| 环境变量 | 默认值 | 行为 |
| --- | --- | --- |
| `DATASET_FULLTEXT_PROVIDER` | SQL 部署 `mongo`；Milvus 部署 `native` | 仅允许 `mongo/native`。`native` 自动使用当前向量库；SQL 目标还须通过回填验收并匹配 ready 记录。 |
| `DATASET_FULLTEXT_DUAL_WRITE` | `true` | SQL 原生读期间是否继续维护 Mongo 全文写删。读 Mongo 时始终维护 Mongo；SQL 词串始终随向量写入。Milvus 不受该开关影响。 |

```text
初始 / 回退：DATASET_FULLTEXT_PROVIDER=mongo；DATASET_FULLTEXT_DUAL_WRITE=true
启用原生读： DATASET_FULLTEXT_PROVIDER=native；DATASET_FULLTEXT_DUAL_WRITE=true
结束回退期： DATASET_FULLTEXT_PROVIDER=native；DATASET_FULLTEXT_DUAL_WRITE=false
```

配置通过环境变量加载，修改后应在所有 App/Pro/训练节点一致更新并重启。迁移仅登记 ready，不更改这些配置。

- 显式读 Mongo：直接使用兼容全文，不查询 SQL ready 元数据。
- 显式读 native：目标就绪且身份匹配时走原生全文；未就绪且持续双写时回退 Mongo。
- native 且关闭双写：目标失效直接报错，不自动返回停止更新的 Mongo 全文。原生查询本身的异常仍上抛。
- 关闭双写后重新开启只能维护后续变化，不能补回关闭期间的历史缺口。完整回退前必须重建并验证 Mongo 全文。
- 本轮不回填 Milvus 的 Mongo 兼容全文，因此不支持将 Milvus 配置为读 Mongo。

## 3. 分词规则与物理目标

仅保留两个就绪约束：

| 字段 | 作用 |
| --- | --- |
| `targetId` | SQL 目标库持久化 UUID，用于绑定 checkpoint 和 ready；换库不能沿用旧游标。 |
| `analyzerVersion` | 所有 SQL provider 共用 `fastgpt-jieba-search-v1`，只表示词典、切词、清洗、停用词及归一化规则。 |

删除固定为 1 的 `schemaVersion`，不再将数据库产品、扩展版本或 provider 名拼进分词版本。provider 在 checkpoint 与 Mongo ready 记录中单独保存，数据库引擎和索引配置由适配器核验。

SQL 的 `fastgpt_fulltext_metadata` 保存目标身份与分词规则；Mongo `dataset_sql_fulltext_targets` 以 provider 为 `_id` 保存通过完整验收的同一份身份。运行期两端必须匹配。

分析器采用 jieba 搜索模式，共用词典、URL/Markdown 清洗与停用词，统一小写。写入、回填、验收和查询使用同一实现；查询词去重，清洗后没有词时不查询 SQL。原文上限 1 MiB，词串上限 16 MiB，拒绝 NUL，不静默截断。OpenGauss 仍会用内置分词处理词串，统一外置规则不表示四库查询语义完全相同。

分词规则变更仍须新迁移代次或明确的重建流程；当前任务仅补 NULL，不能覆盖旧规则生成的非空词串。SQL 元数据格式属于本 PR 尚未发布的结构，不在本轮新增历史格式转换任务或破坏性 DDL。

历史 `synonymVersion` 保留：词串必须还原索引生成时的同义词版本，不能使用最新词表猜测；历史快照无法确认时记录业务 ID 并阻断 ready。图片索引及明确版本 0 不额外依赖同义词快照。

## 4. 数据库适配与异步建索引

共享业务回填流程，逐库实现版本/能力核验、DDL、条件回填和原生查询。SeekDB 复用 OceanBase 适配，但保留独立 provider 与产品版本检查。

| Provider | 当前代码门槛 | 全文实现及检查 |
| --- | --- | --- |
| PG | PG15.19+ 的 15.x，pg_search 0.26.6 | ParadeDB 索引；词串用 `pdb.whitespace`，归属字段用 `pdb.literal`；核对真实扩展、索引定义和有效性。 |
| OceanBase | 至少 4.3.5.1，MySQL 模式 | FULLTEXT SPACE，`min_token_size=1`；核对索引列、可见性、解析器与属性。 |
| SeekDB | 至少 1.0.1 | 与 OceanBase 共用 FULLTEXT 适配，独立解析产品版本。 |
| OpenGauss | 7.0.x，至少 RC2，并具备 DataVec BM25 | 普通 astore 表、nullable TEXT、BM25 索引及对应执行计划。 |

这些版本是当前适配范围，不表示厂商首次支持全文的版本，也不承诺所有更高版本均已验证。必要的产品/扩展约束保留，不能用两个运行配置代替能力检查。

启动只等待基础表、词串列及既有必要索引；`startSqlFullTextIndexBuild` 在后台准备全文索引与物理元数据。失败仅告警，不拒绝应用初始化；后台构建不代表 ready。

启动与手动迁移共享本进程、同 provider 的在途 prepare Promise，避免重复 DDL；完成或失败后释放，允许后续重新准备和核验。数据库自身的 DDL 锁语义未改变，PG 普通建索引仍可能阻塞 `modeldata` 写入，需控制生产构建时机。

## 5. 三阶段手动迁移

任务：`projects/app/src/migration/tasks/4180/20261110_migrate_sql_fulltext/`，首次版本 4.18.0，`manual: true`，恢复策略保持分批断点续跑。

前置：所有旧版 App/Pro/训练写入方已经升级排空。初始状态 waiting，管理员确认后入队；不阻塞 App 启动。手动确认不自动证明集群已排空。

```text
prepare：清除旧 ready → 等待/执行物理准备与能力核验
scan：   校验源记录 → 条件补 NULL / 补建缺失向量 → 写后核对 → 保存错误快照 → 推进游标
validation：完整重验当前有效引用 → 核验全文能力 → 登记 ready
```

### 5.1 合并预检与回填

不再先做独立的全量只读预检。每条回填入口在任何写入前校验完整源记录，包括所有向量 ID、文本和历史同义词。SQL 更新仅命中 ID 与团队/知识库/集合一致的已有行，且只补 NULL。

已有非空冲突值和错误归属不会被覆盖。发现坏记录时允许其他健康记录完成派生词串回填，但最终失败且不登记 ready。

对仍被 Mongo 引用的无效 SQL 行，再按全局 ID 查询确认物理缺失，不能把错误归属当作缺失。仅补建缺失索引：复用 `DatasetDataIndexOperation.insertVectors`，使用知识库配置的 embedding 模型与记录的历史同义词输入，在新 SQL 行中一并写入向量和全文，分配新 ID；不会使用空向量或复用旧 ID。

提交前检查执行权，并在 Mongo 事务中核对模型引用、数据归属、完整 indexes、updateTime、indexStatus 和 synonymVersion，只替换缺失项的 ID。并发编辑、删除或模型重建使快照失效时不提交，清理未被引用的新向量；提交响应不确定时先查主库引用，主库不可读则保留派生行供孤儿清理。修复提交后重新读取并只读验收全部当前引用。原文、历史同义词版本及 Mongo 兼容全文不变；图片补建失败不能静默删除索引。

已提交的修复重试不会再次生成向量；模型调用与 SQL/Mongo 之间没有跨系统事务，中断在提交前仍可能重做请求并产生外部成本。补建沿用余额检查和现有向量用量上报，仅成功提交后上报；它不能恢复原向量的逐位数值，也不能从缺失的 Mongo 索引、历史词表或失效图片猜测输入。模型不可用、待训练/重建的数据保留失败，基础设施异常由 Runner 处理。

这减少了一轮全库扫描与分词；所有有效记录仍需最终完整验收。不能只凭“没有异常抛出”“词串不为 NULL”或计数相同认定成功。

### 5.2 断点、错误与恢复

- checkpoint 绑定 provider、targetId、analyzerVersion，记录 scan 游标、固定上界、阶段与计数；换目标或分词规则不允许续跑。
- scan 按 Mongo 主库 `_id` 稳定分页，每批有界；恢复 scan 时刷新上界以覆盖中断期间新增记录。
- 重试先处理该阶段已保存的失败项，再继续游标后的记录；错误原因只保留有界消息和必要 ID。
- 每个业务批次前确认 lease；批次处理后先报告完整未解决错误快照，再保存 checkpoint。提交后断点前退出可以幂等重放。
- 数据完整性错误记入 failedRecords；连接、超时、驱动等意外错误直接上抛，Runner 保留已提交的错误快照与断点。
- 进入 validation 时始终从头扫描当前完整范围；不沿用旧验收游标跳过前半段。
- 验收本身只读；发现数据错误时进入回填入口补 NULL 或补建缺失向量，再重新只读验收；非空冲突始终失败，不覆盖。
- 回填与验收都会再次读主库确认当前引用，并发删除或替换后的旧向量不要求复活。新增数据依靠升级后的业务写入通道直接写齐词串，不依赖历史扫描追赶。
- 删除跨 Mongo/SQL 不具备分布式原子性：SQL 行已删除、Mongo 删除尚未提交时可能触发补建；引用提交的 CAS 与删除发生竞争，删除先提交则修复失败并清理新行，修复先提交后删除仍以 Mongo 当前引用为准，遗留 SQL 行由孤儿清理回收。绕过正常入口在同一向量 ID 下直接修改文本会作为冲突阻断 ready，不静默覆盖。
- 所有未解决错误清零、全文能力检查通过后才登记 ready。运行状态由 Runner/Context 管理，脚本不直接修改任务状态表。

返回值保留 applicable、provider、targetId、analyzerVersion、scanned、validated，不再返回 prechecked。Milvus 按相同三阶段报告不适用，不执行 SQL。

## 6. 检索与兼容期

SQL 先按团队、知识库、集合允许/禁止范围过滤，再做相关性排名与 limit。返回向量 ID，经 Mongo 主库当前索引引用映射为业务块，去重后进入既有 RRF/rerank。

候选逐步扩展且最多 500 条；本轮按用户要求保留现有预算与去重行为，不额外实现分组 Top-K 或分页。

兼容期持续双写时，管理员可以手动在 mongo/native 之间切换。迁移完成不等于正式启用：实际部署仍需对关键查询、质量、延迟和持续写入做验收，PG 回填后的维护也需纳入上线流程。

本轮不删除旧 Mongo 集合、活动索引、正文、既有向量或文件；补建失败只回收本次新生成且未被引用的行。停止双写及清理须在后续明确结束回退窗口后安排；独立清理任务应核验范围并排空写入，不在本任务中加入清理状态机。

一个 Mongo 业务库内每 provider 仅绑定一个目标。多目标范围隔离、跨时间点备份恢复、分析器变更的非空词串重建均需独立设计，不能沿用旧成功状态。

## 7. 验证范围

局部测试应覆盖：

- 三阶段注册、Milvus 不适用边界、手动 waiting 入队和真实 Runner 完成/失败。
- 坏数据与健康数据混合时健康行可回填，错误完整保存且 ready 不激活；修复后优先重试游标前错误。
- 源记录无效时不写该记录，已有词串冲突不覆盖，向量/正文及旧 Mongo 全文保持原样。
- 只补建物理缺失项，向量和全文同写、新 ID 替换、重试不重复生成；历史同义词、并发编辑/删除/换模型、lease 丢失、图片生成失败及不确定提交后的保守清理。
- checkpoint 提交前退出、取消、lease 失效、意外数据库错误、恢复验收重扫及条件补 NULL。
- 目标/规则不匹配拒绝恢复，目标 ready 记录在 Mongo 事务中的提交和回滚。
- 默认 Mongo、显式 native 自动选择当前 provider、持续双写回退、关闭双写后拒绝陈旧兼容读。
- 每库真实版本、DDL、索引属性、过滤和分词语义。缺少隔离实例时跳过，不能记作通过。

真实 SQL 集成入口保留 database.integration.test.ts；PG 恢复演练为 service.integration.test.ts，公开语料为 quality.integration.test.ts。测试只可使用 Mac Mini Dev 服务的独立测试库/schema；需要 localhost 的测试通过 SSH 转发访问远端，禁止本机创建测试数据库或容器。

### 历史实验记录（作者既有证据）

以下为原 PR 的 PG 公开语料记录，不是本次代码简化重新测得的性能或质量结论。输入清单与哈希保存在 quality.datasets.json，完整原始报告在仓库外，使用时需核对运行环境。

| 语料 | 文档 / 查询 | Hit@10 Mongo → PG |
| --- | --- | --- |
| C-MTEB CovidRetrieval | 100,001 / 949 | 84.30% → 89.36% |
| NanoMIRACL 中文 | 1,700 / 200 | 74.00% → 84.50% |
| BEIR SciFact | 5,183 / 300 | 71.67% → 80.67% |
| BEIR NFCorpus | 3,633 / 323 | 65.63% → 69.35% |
| NanoMIRACL 英文 | 1,657 / 200 | 93.00% → 95.50% |
| NanoMIRACL 日文 | 1,846 / 200 | 49.50% → 89.50% |

这些用例采用一文档一索引，不能替代真实多索引业务分布及目标并发的端到端验收。原 PR 也记录过业务抽样中的有效向量引用缺失；本任务尝试补建确认物理缺失的行，仍不能修复的记录阻断 ready。

## 8. 待办

- [ ] 逐库核对正式支持组合及原始实测报告，统一代码、注释和发布说明中的验证状态。
- [ ] 按真实业务规模验收回填耗时、数据库锁、资源消耗和查询质量/长尾延迟。
- [ ] 备份恢复与多目标隔离另行设计；分析器变更时提供非空词串重建的独立迁移。
- [ ] 观察期结束后再设计旧全文清理与写入排空屏障。
- [ ] 若调整部署镜像或部署 YAML，先获得用户明确确认；本轮不修改部署配置。
