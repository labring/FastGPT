# chunk 引用检查与阶段弃用

本清单覆盖主仓库和 Pro 子仓库的已跟踪文件及未忽略的新文件。排除依赖、构建输出等 Git 忽略文件、二进制、符号链接、环境变量文件和本清单自身；包括仓库自带的 Monaco 等第三方静态资源。搜索大小写不敏感的 `chunk` 子串（含 `chunks`、`chunkIndex`、`chunkSize` 等），以及旧函数名 `generateVector` 和笔误 `chuk nk`。

共 **389 个文件、3084 个匹配行**；`chuk nk` 笔误匹配 **0** 处。下面的分册列出每个文件和全部命中行号。

- [完整引用清单 1](references-1.md)
- [完整引用清单 2](references-2.md)

## 旧训练阶段：保留的兼容与迁移用途

| 位置 | 用途 |
| --- | --- |
| `packages/global/core/dataset/constants.ts` → `TrainingModeEnum.chunk` | 恢复字面值 `chunk`，通过 `@deprecated` 标记弃用，说明须迁移至 index/rebuild；无消费者。 |
| `packages/service/core/dataset/training/query.ts` | 兼容历史记录的阶段排序与统计。 |
| `projects/app/src/pages/api/core/dataset/collection/trainingDetail.ts` | 历史 chunk 记录的 queued/running/error 计数字段。 |
| `projects/app/src/web/core/dataset/trainingStatus.ts` | 历史记录的阶段文案和颜色。 |
| `projects/app/scripts/migration/chunkTrainingToIndex.ts` | 读取历史 chunk；无数据先预落库，有数据按状态转 index/rebuild；同时补齐旧增强任务的 dataId。 |
| `projects/app/package.json` → `migrate:chunk` | 手动迁移命令名。 |
| `projects/app/test/scripts/migration/chunkTrainingToIndex.test.ts` | 构造旧记录，验证迁移与失败时保留源任务。 |
| `projects/app/test/service/core/dataset/queues/generateRebuildIndex.test.ts` | 验证旧 chunk 不会被 rebuild/index worker 消费；其它 chunk content 为普通测试正文。 |
| `projects/app/test/pageComponents/dataset/detail/CollectionCard/trainingStatesUtils.test.ts` | 保留 chunk: 0 兼容字段，活跃阶段计数已改为 rebuild。 |
| `packages/global/core/dataset/type.ts`、`packages/global/openapi/core/dataset/training/api.ts`、`packages/global/openapi/core/dataset/collection/api.ts` | 通过 z.enum(TrainingModeEnum) 间接兼容历史任务的模式和计数响应。 |
| `packages/service/core/dataset/training/schema.ts` | 通过 Object.values(TrainingModeEnum) 间接允许读取/校验旧模式，不创建消费者。 |

生产入口 `getTrainingModeLimit` 不接受弃用的 chunk；正常入口产生 index/rebuild，worker 领取与唤醒只处理当前阶段。没有恢复 generateVector 或 chunk 消费入口。

## 本次发现并修正的残留

- `pro/admin/src/service/core/dataset/training/autoTrainingProcess.ts`：1 条旧 chunk 队列注释。
- `pro/admin/src/service/core/dataset/training/imageIndex.ts`：2 条旧 chunk 队列注释。
- `packages/service/core/dataset/collection/utils.ts`：流程注释末端的 chunk index 改为 index。
- `projects/app/test/api/core/dataset/data/pushData.test.ts`：阶段选择 mock 由 chunk 改为 index。
- `projects/app/test/api/core/dataset/training/rebuildEmbedding.test.ts`：测试名称中的 chunk mode 改为 rebuild mode。
- `projects/app/test/pageComponents/dataset/detail/CollectionCard/trainingStatesUtils.test.ts`：补齐 rebuild 计数，保留弃用的 chunk 零值兼容字段。
- `projects/app/test/service/core/dataset/indexStatusDownstream.test.ts`：待索引数据的任务由硬编码 chunk 改为 index。
- `projects/app/test/api/core/dataset/data/insertImages.test.ts`：测试名称中的 chunk mode 改为 index mode。
- `.agents/design/core/dataset/index.md`：训练阶段列表补充 index/rebuild，chunk 标记弃用。
- `.agents/design/core/dataset/synonym-feature-design.md`：同义词重建最终阶段更新为 rebuild。

## 保留的其它 chunk 概念

- **DatasetCollectionDataProcessModeEnum.chunk**：集合的数据处理方式，表示按文本分块，仍用于导入表单、解析、预览、同步、集合创建与 OpenAPI 的 trainingType；不属于弃用的训练队列阶段。
- **chunkIndex/chunkSize/chunks 等**：数据块顺序、分块参数、数据块数组及其类型/测试；不应整体弃用。
- **流式 chunk**：LLM/SSE、文件流、HTTP、语音等增量数据块。
- **批量写入 chunk**：数组分批、全文索引迁移、向量库批处理。
- **翻译、用户文档和测试正文**：知识库数据块的文字描述和样例。
- **第三方静态资源与构建配置**：Monaco、编译器、打包分包等。

保留枚举值用于兼容识别不会执行迁移。本次没有运行迁移脚本或更改数据库。
