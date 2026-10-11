import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';
import type {
  UpdateDatasetDataPropsType,
  DatasetDataItemType,
  CreateDatasetDataPropsType
} from '@fastgpt/global/core/dataset/type';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { isS3ObjectKey, removeS3TTL } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import {
  datasetDataSystemIndexTypes,
  isDatasetDataFailed,
  isDatasetDataSystemIndexType
} from '@fastgpt/global/core/dataset/data/utils';
import {
  DatasetDataIndexOperation,
  type DatasetDataIndexDraft
} from '@/service/core/dataset/data/dataIndex';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import {
  getDatasetSynonymMatcher,
  getDatasetSynonymTransformContext,
  isDatasetSynonymEnabled
} from '@fastgpt/service/core/dataset/synonym/entity';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { refreshDatasetDataVectorCreateTime } from '@fastgpt/service/common/vectorDB/controller';
import { assertDatasetDataWritable } from '@fastgpt/service/core/dataset/data/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

/** 删除只需要定位信息和派生资源，调用方无需构造页面展示字段。 */
type DeleteDatasetDataProps = Pick<
  DatasetDataItemType,
  'id' | 'teamId' | 'datasetId' | 'collectionId' | 'indexes' | 'imageId'
>;

/** 提交边界由上层注入；数据写入回调无需接收租约对象。 */
type CommitDatasetData = (write: (session: ClientSession) => Promise<void>) => Promise<void>;

/** 复用现有 session 与自定义提交边界互斥；均未传入时自行开启事务。 */
type DatasetDataWriteOptions =
  | { session?: ClientSession; commit?: never }
  | { session?: never; commit: CommitDatasetData };

type UpdateDatasetDataByIndexesProps = Omit<UpdateDatasetDataPropsType, 'indexes' | 'q'> & {
  /** 替换索引必须等待整个事务提交，不能传入尚未提交的外部 session。 */
  commit?: CommitDatasetData;
  q?: string;
  indexes?: NonNullable<UpdateDatasetDataPropsType['indexes']>;
  /** 首次训练产生的派生图片描述，与 indexes 在同一次 CAS 中写回。 */
  imageDescMap?: Record<string, string>;
  model: EmbeddingModelDataType;
  indexSize?: number;
  imageIndex?: boolean;
  /** 重建索引时忽略文本相同判断，确保切换 embedding model 后重新生成向量。 */
  forceRebuild?: boolean;
};

type UpdateDatasetDataSystemIndexesProps = Omit<
  UpdateDatasetDataByIndexesProps,
  'indexes' | 'q' | 'forceRebuild' | 'imageDescMap' | 'commit'
> & {
  q?: string;
  imageIndex?: boolean;
  indexes?: DatasetDataIndexDraft[];
};

type RebuildDatasetDataIndexesProps = {
  dataId: string;
  model: EmbeddingModelDataType;
  commit?: CommitDatasetData;
  /** 仅同义词重建允许复用输入未变化的向量；模型切换必须全量生成。 */
  diffSynonym?: boolean;
};

/*
  数据进入 data/dataIndex 层时，VLM 图片描述索引已经由训练链路提前处理。
  这里只负责根据 data 当前内容生成系统索引，并保留外部传入的 question/summary/image/custom 索引。

  数据的几种情况：

  1. 普通文本数据：有 q/a
    - q/a 拆成 default 文本索引。
    - 如果 collection 开启 imageIndex 且 embedding model 支持多模态：
      q/a 里的 markdown 图片链接会生成 imageEmbedding 图片向量索引。

  2. 纯图片数据：有 imageId，q 可以没有
    - 如果 embedding model 支持多模态：用 imageId 生成 imageEmbedding 图片向量索引。
    - 如果上游 VLM 已经生成 q，q 会继续生成 default 文本索引。
*/

/**
 * 数据条目的写操作入口。
 *
 * 这个类负责协调一条 dataset data 相关的多份存储：
 * - MongoDatasetData：主数据、Q/A、indexes、历史记录
 * - MongoDatasetDataText：全文检索 token
 * - 向量库：每个 index 对应的向量记录
 * - S3：图片数据的生命周期或删除
 *
 * 修改这些流程时要特别注意写入顺序，避免 Mongo 中的 index dataId 和向量库记录不一致。
 */
export class DatasetDataOperation {
  private readonly indexOperation: DatasetDataIndexOperation;

  constructor(model?: EmbeddingModelDataType) {
    this.indexOperation = new DatasetDataIndexOperation(model);
  }

  /**
   * 通知 collection 重新计算统计信息和更新时间。
   * data/index/vector 任一写操作完成后都应触发一次。
   */
  private pushCollectionUpdate({
    collectionId,
    datasetId,
    teamId
  }: {
    collectionId: string;
    datasetId: string;
    teamId: string;
  }) {
    pushCollectionUpdateJob({
      collectionId: String(collectionId),
      datasetId: String(datasetId),
      teamId: String(teamId)
    });
  }

  /** 向量生成后才进入提交边界；互斥校验也保护未经过 TypeScript 的调用方。 */
  private commitDataWrite({
    session,
    commit,
    fn
  }: {
    session?: ClientSession;
    commit?: CommitDatasetData;
    fn: (session: ClientSession) => Promise<void>;
  }) {
    if (session && commit) throw new Error('session and commit are mutually exclusive');
    if (commit) return commit(fn);
    if (session) return fn(session);
    return mongoSessionRun(fn);
  }

  /** 已提交的新索引不能因旧向量清理失败被补偿删除；清理失败记录原始 ID 以便排查。 */
  private async cleanupReplacedVectors({ teamId, idList }: { teamId: string; idList: string[] }) {
    await this.indexOperation.deleteVectors({ teamId, idList }).catch((error) => {
      logger.error('Failed to clean up replaced dataset vectors', { error, teamId, idList });
    });
  }

  /**
   * 创建一条 dataset data。
   *
   * 流程顺序：
   * 1. 根据 Q/A 和传入 indexes 生成最终索引列表
   * 2. 先写入向量库，拿到每条索引对应的 dataId
   * 3. 写入主数据和全文检索 token
   * 4. 如果图片来自 dataset S3 临时区，移除 TTL，避免被清理
   *
   * 主数据、Mongo 全文索引和图片 TTL 状态在同一个提交边界中写入。
   * 向量库不参与 Mongo 事务，事务失败产生的孤儿向量由一致性任务清理。
   */
  async create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q,
    a,
    imageId,
    chunkIndex = 0,
    indexSize = 512,
    indexes,
    indexPrefix,
    embeddingModel,
    imageIndex,
    imageDescMap,
    metadata,
    session,
    commit
  }: CreateDatasetDataPropsType &
    DatasetDataWriteOptions & {
      embeddingModel: EmbeddingModelDataType;
      indexSize?: number;
      imageIndex?: boolean;
      imageDescMap?: Record<string, string>;
    }) {
    // 纯图片数据允许没有正文；indexQ 保持为空，避免生成普通 default 文本向量索引。
    const dataQ = q || '';
    const indexQ = q || '';

    if ((!dataQ && !imageId) || !datasetId || !collectionId || !embeddingModel) {
      return Promise.reject('q, datasetId, collectionId, embeddingModel is required');
    }

    const embModel = embeddingModel;
    indexSize = Math.min(embModel.config.maxToken, indexSize);

    // 系统索引和外部索引在这里统一规范化，确保后续向量写入的输入已去重、切分。
    const newIndexes = await this.indexOperation.formatIndexes({
      indexes,
      q: indexQ,
      a,
      imageId,
      imageIndex,
      indexSize,
      maxIndexSize: embModel.config.maxToken,
      indexPrefix
    });

    const synonymContext = isDatasetSynonymEnabled()
      ? await getDatasetSynonymTransformContext({ teamId, datasetId })
      : undefined;

    const { tokens, indexes: results } = await this.indexOperation.insertVectors({
      indexes: newIndexes,
      teamId,
      datasetId,
      collectionId,
      transformText: synonymContext?.transformText
    });

    const assertSynonymContextCurrent = async () => {
      if (!synonymContext) return;
      if (await synonymContext.isCurrent()) return;
      await this.indexOperation
        .deleteVectors({ teamId, idList: results.map((index) => index.dataId) })
        .catch(() => {});
      throw new Error('同义词配置已变化，请重试数据写入');
    };
    // 主数据保存的是带 dataId 的 indexes，因此需要先完成向量写入。
    let insertId = '';
    try {
      await this.commitDataWrite({
        session,
        commit,
        fn: async (mongoSession) => {
          const [{ _id }] = await MongoDatasetData.create(
            [
              {
                teamId,
                tmbId,
                datasetId,
                collectionId,
                q: dataQ,
                a,
                imageId,
                imageDescMap,
                ...(metadata && { metadata }),
                chunkIndex,
                indexes: results,
                ...(synonymContext && { synonymVersion: synonymContext.version })
              }
            ],
            { session: mongoSession, ordered: true }
          );
          insertId = String(_id);

          await getFullTextStore().write(
            [
              {
                teamId,
                datasetId,
                collectionId,
                dataId: String(_id),
                fullText:
                  synonymContext?.transformText(`${indexQ}\n${a}`.trim()) ??
                  `${indexQ}\n${a}`.trim()
              }
            ],
            mongoSession
          );
          await assertSynonymContextCurrent();

          if (
            isS3ObjectKey(imageId, 'dataset') &&
            isAuthorizedDatasetFileS3Key({ key: imageId, datasetId })
          ) {
            await removeS3TTL({ key: imageId, bucketName: 'private', session: mongoSession });
          }
        }
      });
    } catch (error) {
      await this.indexOperation
        .deleteVectors({ teamId, idList: results.map((index) => index.dataId) })
        .catch(() => {});
      throw error;
    }

    this.pushCollectionUpdate({
      collectionId,
      datasetId,
      teamId
    });

    return {
      insertId,
      tokens
    };
  }

  /**
   * 按调用方传入的完整 indexes 更新数据。
   *
   * 这个路径用于“手动指定全部索引”的更新：调用方给出的 indexes 会和系统索引
   * 一起格式化后与当前 indexes 做 diff，新增/变更的索引重建向量，删除的索引清理旧向量。
   * 先刷新旧向量时间，再生成新向量、提交 data，最后删除旧向量；删除失败由 cron 尝试补偿。
   * 数据失败时强制替换全部向量，并在同一事务内清理失败任务，不能复用旧模型的同文索引。
   */
  async updateByIndexes({
    dataId,
    q,
    a,
    imageId,
    indexes,
    model,
    indexSize = 512,
    indexPrefix,
    imageIndex,
    metadata,
    forceRebuild = false,
    imageDescMap,
    commit
  }: UpdateDatasetDataByIndexesProps) {
    const embModel = model;

    if (!embModel) {
      return Promise.reject('Embedding model not found');
    }
    if (!Array.isArray(indexes)) return Promise.reject('indexes is required');

    const mongoData = await MongoDatasetData.findById(dataId);
    if (!mongoData) return Promise.reject('Data not found');
    // API 鉴权后可能已被重试接管；Worker 自带租约提交边界，不走手动编辑写保护。
    if (!commit) await assertDatasetDataWritable(mongoData.indexStatus);

    const isFailed = isDatasetDataFailed(mongoData.indexStatus);
    // 获取新的索引组合
    const nextQ = q ?? mongoData.q ?? '';
    const nextA = a ?? mongoData.a ?? '';
    const nextImageId = imageId ?? mongoData.imageId;
    const formatIndexesResult = await this.indexOperation.formatIndexes({
      indexes,
      q: nextQ,
      a: nextA,
      imageId: nextImageId,
      imageIndex,
      indexSize,
      maxIndexSize: embModel.config.maxToken,
      indexPrefix
    });
    const synonymContext = isDatasetSynonymEnabled()
      ? await getDatasetSynonymTransformContext({
          teamId: String(mongoData.teamId),
          datasetId: String(mongoData.datasetId)
        })
      : undefined;

    // 把旧的 dataId 加到新的索引里
    const indexesWithExistingSystemIds = this.indexOperation.mergeExistingSystemIndexIds({
      currentIndexes: mongoData.indexes,
      nextSystemIndexes: formatIndexesResult
    });

    // patchResult 先保留旧 dataId；insertVectorForPatch 会为 create/update 项写入新向量并回填新 dataId。
    const patchResult = this.indexOperation.buildPatch({
      currentIndexes: mongoData.indexes,
      nextIndexes: indexesWithExistingSystemIds,
      isSameIndex: forceRebuild || isFailed ? () => false : undefined
    });
    // 先保存旧向量 id；insertVectorForPatch 会原地把 update 项替换成新 dataId。
    const deleteVectorIdList = this.indexOperation.getDeleteVectorIdList(patchResult);

    const updateTime = mongoData.updateTime;
    let tokens = 0;
    let newVectorIdList: string[] = [];
    try {
      // 先让旧向量重新进入 cron 扫描窗口；刷新失败不能继续生成新向量或完成 training。
      await refreshDatasetDataVectorCreateTime({
        teamId: mongoData.teamId,
        idList: deleteVectorIdList
      });
      tokens = await this.indexOperation.insertVectorForPatch({
        patchResult,
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        collectionId: mongoData.collectionId,
        transformText: synonymContext?.transformText
      });
      const newIndexes = this.indexOperation.getWritablePatchIndexes(patchResult);
      newVectorIdList = patchResult
        .filter((item) => item.type === 'create' || item.type === 'update')
        .filter((item) => !item.skipped)
        .map((item) => item.index.dataId)
        .filter(Boolean) as string[];
      await this.commitDataWrite({
        commit,
        fn: async (mongoSession) => {
          if (synonymContext?.isCurrent && !(await synonymContext.isCurrent())) {
            throw new Error('同义词配置已变化，请重试索引更新');
          }
          // 重试只改变状态、不更新 updateTime；失败修复还需校验状态，不能覆盖已恢复的任务。
          const updateResult = await MongoDatasetData.updateOne(
            {
              _id: mongoData._id,
              ...((synonymContext || isFailed) && { updateTime }),
              ...(isFailed && { indexStatus: mongoData.indexStatus })
            },
            {
              $set: {
                // 用归一化后的旧值比较：缺失的 a/q 与空串语义相同，不应因此写入一条无变化的历史。
                ...(nextQ !== (mongoData.q ?? '') || nextA !== (mongoData.a ?? '')
                  ? {
                      history: [
                        { q: mongoData.q, a: mongoData.a, updateTime },
                        ...(mongoData.history?.slice(0, 9) ?? [])
                      ]
                    }
                  : {}),
                q: nextQ,
                a: nextA,
                ...(metadata !== undefined ? { metadata } : {}),
                ...(imageDescMap !== undefined ? { imageDescMap } : {}),
                indexes: newIndexes,
                indexStatus: DatasetDataIndexStatusEnum.indexed,
                ...((synonymContext || isFailed) && {
                  synonymVersion: synonymContext?.version ?? 0
                }),
                updateTime: new Date()
              },
              $unset: {
                ...(synonymContext || isFailed ? { synonymRebuildingVersion: '' } : {}),
                indexErrorMsg: ''
              }
            },
            { session: mongoSession }
          );
          if ((synonymContext || isFailed) && updateResult.modifiedCount !== 1) {
            throw new Error('数据已变化，请重试索引更新');
          }

          // Q/A 变化会影响全文检索结果,需要和主数据一并更新(milvus 下为 no-op,全文随向量 upsert 覆盖)。
          await getFullTextStore().write(
            [
              {
                teamId: String(mongoData.teamId),
                datasetId: String(mongoData.datasetId),
                collectionId: String(mongoData.collectionId),
                dataId: String(mongoData._id),
                fullText:
                  synonymContext?.transformText(`${nextQ}\n${nextA}`.trim()) ??
                  `${nextQ}\n${nextA}`.trim()
              }
            ],
            mongoSession
          );

          if (!commit && isFailed) {
            await MongoDatasetTraining.deleteMany(
              {
                teamId: mongoData.teamId,
                datasetId: mongoData.datasetId,
                dataId: mongoData._id
              },
              { session: mongoSession }
            );
          }
        }
      });
    } catch (error) {
      if (synonymContext || commit || isFailed) {
        await this.indexOperation
          .deleteVectors({ teamId: mongoData.teamId, idList: newVectorIdList })
          .catch(() => {});
      }
      throw error;
    }

    // lease.complete 包含 training 删除和事务提交；此前必须保留旧向量供回滚或重跑使用。
    await this.cleanupReplacedVectors({ teamId: mongoData.teamId, idList: deleteVectorIdList });

    this.pushCollectionUpdate({
      collectionId: mongoData.collectionId,
      datasetId: mongoData.datasetId,
      teamId: mongoData.teamId
    });

    return {
      tokens
    };
  }

  /**
   * 仅用已存 indexes 重建向量和全文索引，不读取或修改 q/a、图片描述、历史记录。
   * 同义词重建复用转换输入未变化的向量；模型重建全量生成，不支持的图片由索引层跳过。
   * 新索引与任务完成原子提交，CAS 防止覆盖在途编辑；提交失败清理新向量，成功后清理旧向量。
   */
  async rebuildIndexes({ dataId, commit, diffSynonym = false }: RebuildDatasetDataIndexesProps) {
    // 1. 读取已存索引快照，保留 updateTime 用于提交时检查并发修改。
    const mongoData = await MongoDatasetData.findById(dataId)
      .select('_id teamId datasetId collectionId indexes updateTime synonymVersion')
      .lean();
    if (!mongoData) return Promise.reject('Data not found');

    // 2. 获取本次向量化使用的词表快照；功能关闭时不查询同义词配置。
    const synonymContext = isDatasetSynonymEnabled()
      ? await getDatasetSynonymTransformContext({
          teamId: String(mongoData.teamId),
          datasetId: String(mongoData.datasetId)
        })
      : undefined;

    // 3. 仅在同义词差量重建时还原旧转换规则，用于比较实际 embedding 输入。
    const previousTransformText = await (async () => {
      if (!diffSynonym || !synonymContext) return;

      // 版本 0 明确表示未使用词表，旧向量直接基于原文生成。
      if (mongoData.synonymVersion === 0) return (text: string) => text;

      // 未记录版本或历史快照已被清理时，全量生成，不能猜测旧向量的输入。
      if (mongoData.synonymVersion === undefined) return;

      const matcher = await getDatasetSynonymMatcher({
        teamId: String(mongoData.teamId),
        datasetId: String(mongoData.datasetId),
        fileVersion: mongoData.synonymVersion
      });
      if (matcher.hasMappings) return (text: string) => matcher.transform(text).transformedText;
    })();

    // 4. 确定需要替换的索引和可复用的索引，此时 patch 中仍保留旧向量 ID。
    const patchResult = (() => {
      // 功能关闭或普通索引重建时，直接全量更新，不进入逐项 diff。
      if (!diffSynonym || !synonymContext) {
        return mongoData.indexes.map((index) => ({ type: 'update' as const, index: { ...index } }));
      }

      return this.indexOperation.buildPatch({
        currentIndexes: mongoData.indexes,
        nextIndexes: mongoData.indexes,
        isSameIndex: (current, next) => {
          // 同义词不会影响图片输入；其余索引比较实际送入 embedding 的文本。
          if (current.type === DatasetDataIndexTypeEnum.imageEmbedding) return true;
          return (
            !!previousTransformText &&
            previousTransformText(current.text) === synonymContext.transformText(next.text)
          );
        }
      });
    })();

    // 5. 在 patch 回填新 ID 前保存待删除的旧 ID，并刷新时间以便一致性任务兜底清理。
    const oldVectorIds = this.indexOperation.getDeleteVectorIdList(patchResult);
    await refreshDatasetDataVectorCreateTime({ teamId: mongoData.teamId, idList: oldVectorIds });

    // 6. 只为变更项生成向量；索引层会将新 ID 回填到 patch，复用项保持不变。
    const tokens = await this.indexOperation.insertVectorForPatch({
      patchResult,
      teamId: String(mongoData.teamId),
      datasetId: String(mongoData.datasetId),
      collectionId: String(mongoData.collectionId),
      transformText: synonymContext?.transformText
    });

    // 7. 汇总最终索引，并单独记录本次新增的向量，确保回滚不会删除复用项。
    const indexes = this.indexOperation.getWritablePatchIndexes(patchResult);
    const newVectorIds = this.indexOperation
      .getWritablePatchIndexes(
        patchResult.filter((item) => item.type === 'create' || item.type === 'update')
      )
      .map((index) => index.dataId);

    // 8. 校验词表和数据快照后，原子提交索引、全文和任务完成状态。
    try {
      await this.commitDataWrite({
        commit,
        fn: async (session) => {
          if (synonymContext && !(await synonymContext.isCurrent())) {
            throw new Error('同义词配置已变化，请重试索引更新');
          }

          const result = await MongoDatasetData.updateOne(
            { _id: mongoData._id, updateTime: mongoData.updateTime },
            {
              $set: {
                indexes,
                indexStatus: DatasetDataIndexStatusEnum.indexed,
                updateTime: new Date(),
                ...(synonymContext && { synonymVersion: synonymContext.version })
              },
              $unset: {
                indexErrorMsg: '',
                ...(synonymContext && { synonymRebuildingVersion: '' })
              }
            },
            { session }
          );
          if (result.matchedCount !== 1) throw new Error('数据已变化，请重试索引更新');

          // 历史全文可能来自 q/a，不能仅凭词表 diff 跳过写入；统一从已存文本索引派生。
          const fullText = indexes
            .filter((index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding)
            .map((index) => index.text)
            .join('\n');
          await getFullTextStore().write(
            [
              {
                teamId: String(mongoData.teamId),
                datasetId: String(mongoData.datasetId),
                collectionId: String(mongoData.collectionId),
                dataId: String(mongoData._id),
                fullText: synonymContext?.transformText(fullText) ?? fullText
              }
            ],
            session
          );
        }
      });
    } catch (error) {
      await this.indexOperation
        .deleteVectors({ teamId: mongoData.teamId, idList: newVectorIds })
        .catch(() => {});
      throw error;
    }

    // 9. 提交成功后再删除被替换的旧向量，并通知集合更新统计。
    await this.cleanupReplacedVectors({ teamId: mongoData.teamId, idList: oldVectorIds });
    this.pushCollectionUpdate({
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });

    return { tokens };
  }

  /**
   * 保存正文/答案并重建系统索引；失败数据额外重算全部保留索引。
   *
   * 正常数据只替换 `default` / `imageEmbedding`，并基于数据库当前值保留外部索引，
   * 避免 custom、question、summary、image 等外部索引被格式化、去重或并发覆盖。
   * 首次训练或重建失败时，保留外部索引文本但替换全部向量；成功提交后清理失败任务，
   * 避免旧模型或旧同义词版本的外部索引被误标为已就绪。
   */
  async updateSystemIndexes({
    dataId,
    q,
    a,
    imageId,
    model,
    indexSize = 512,
    indexPrefix,
    imageIndex
  }: UpdateDatasetDataSystemIndexesProps) {
    const mongoData = await MongoDatasetData.findById(dataId);
    if (!mongoData) return Promise.reject('Data not found');
    await assertDatasetDataWritable(mongoData.indexStatus);

    const isFailed = isDatasetDataFailed(mongoData.indexStatus);
    const embModel = model;
    const nextQ = q ?? mongoData.q ?? '';
    const nextA = a ?? mongoData.a ?? '';
    const nextImageId = imageId ?? mongoData.imageId;
    const synonymContext = isDatasetSynonymEnabled()
      ? await getDatasetSynonymTransformContext({
          teamId: String(mongoData.teamId),
          datasetId: String(mongoData.datasetId)
        })
      : undefined;
    indexSize = Math.min(embModel.config.maxToken, indexSize);

    const systemIndexes = await this.indexOperation.getSystemIndexes({
      q: nextQ,
      a: nextA,
      imageId: nextImageId,
      imageIndex,
      indexSize,
      maxIndexSize: embModel.config.maxToken,
      indexPrefix
    });
    // 系统索引文本没变化时复用旧 dataId，避免无意义的向量重建。
    const nextSystemIndexDrafts = this.indexOperation.mergeExistingSystemIndexIds({
      currentIndexes: mongoData.indexes,
      nextSystemIndexes: systemIndexes
    });

    const patchResult = this.indexOperation.buildPatch({
      currentIndexes: mongoData.indexes,
      nextIndexes: isFailed
        ? [
            ...mongoData.indexes
              .filter((index) => !isDatasetDataSystemIndexType(index.type))
              .map(({ type, text, dataId }) => ({ type, text, dataId })),
            ...nextSystemIndexDrafts
          ]
        : nextSystemIndexDrafts,
      currentIndexFilter: isFailed
        ? undefined
        : (index) => isDatasetDataSystemIndexType(index.type),
      isSameIndex: isFailed
        ? () => false
        : (current, next) => current.text === next.text && current.type === next.type
    });
    // insertVectorForPatch 会覆盖 update 项的 dataId，因此需先保留旧向量 id。
    const deleteVectorIdList = this.indexOperation.getDeleteVectorIdList(patchResult);
    const updateTime = mongoData.updateTime;
    const isDataChanged = nextQ !== mongoData.q || nextA !== mongoData.a;
    let tokens = 0;
    let newVectorIdList: string[] = [];
    try {
      await refreshDatasetDataVectorCreateTime({
        teamId: mongoData.teamId,
        idList: deleteVectorIdList
      });
      tokens = await this.indexOperation.insertVectorForPatch({
        patchResult,
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        collectionId: mongoData.collectionId,
        transformText: synonymContext?.transformText
      });
      const nextIndexes = this.indexOperation.getWritablePatchIndexes(patchResult);
      newVectorIdList = patchResult
        .filter((item) => item.type === 'create' || item.type === 'update')
        .filter((item) => !item.skipped)
        .map((item) => item.index.dataId)
        .filter(Boolean) as string[];
      await mongoSessionRun(async (session) => {
        if (synonymContext?.isCurrent && !(await synonymContext.isCurrent())) {
          throw new Error('同义词配置已变化，请重试索引更新');
        }
        const updateResult = await MongoDatasetData.updateOne(
          {
            _id: mongoData._id,
            ...((synonymContext || isFailed) && { updateTime }),
            ...(isFailed && { indexStatus: mongoData.indexStatus })
          },
          [
            {
              $set: {
                ...(isDataChanged
                  ? {
                      history: {
                        $literal: [
                          {
                            q: mongoData.q,
                            a: mongoData.a,
                            updateTime
                          },
                          ...(mongoData.history?.slice(0, 9) || [])
                        ]
                      }
                    }
                  : {}),
                q: { $literal: nextQ },
                a: { $literal: nextA },
                indexes: isFailed
                  ? { $literal: nextIndexes }
                  : {
                      $concatArrays: [
                        {
                          $filter: {
                            input: '$indexes',
                            as: 'index',
                            cond: {
                              $not: [{ $in: ['$$index.type', datasetDataSystemIndexTypes] }]
                            }
                          }
                        },
                        { $literal: nextIndexes }
                      ]
                    },
                indexStatus: { $literal: DatasetDataIndexStatusEnum.indexed },
                indexErrorMsg: '$$REMOVE',
                ...((synonymContext || isFailed) && {
                  synonymVersion: synonymContext?.version ?? 0,
                  synonymRebuildingVersion: '$$REMOVE'
                }),
                updateTime: { $literal: new Date() }
              }
            }
          ],
          { session }
        );
        if ((synonymContext || isFailed) && updateResult.modifiedCount !== 1) {
          throw new Error('数据已变化，请重试索引更新');
        }

        // Q/A 变化会影响全文检索结果(milvus 下为 no-op,全文随向量 upsert 覆盖)。
        await getFullTextStore().write(
          [
            {
              teamId: String(mongoData.teamId),
              datasetId: String(mongoData.datasetId),
              collectionId: String(mongoData.collectionId),
              dataId: String(mongoData._id),
              fullText:
                synonymContext?.transformText(`${nextQ}\n${nextA}`.trim()) ??
                `${nextQ}\n${nextA}`.trim()
            }
          ],
          session
        );

        if (isFailed) {
          await MongoDatasetTraining.deleteMany(
            {
              teamId: mongoData.teamId,
              datasetId: mongoData.datasetId,
              dataId: mongoData._id
            },
            { session }
          );
        }
      });
    } catch (error) {
      if (synonymContext || isFailed) {
        await this.indexOperation
          .deleteVectors({ teamId: mongoData.teamId, idList: newVectorIdList })
          .catch(() => {});
      }
      throw error;
    }

    await this.cleanupReplacedVectors({ teamId: mongoData.teamId, idList: deleteVectorIdList });

    this.pushCollectionUpdate({
      collectionId: mongoData.collectionId,
      datasetId: mongoData.datasetId,
      teamId: mongoData.teamId
    });

    return {
      tokens
    };
  }

  /**
   * 删除一条 dataset data 以及所有派生资源。
   *
   * 删除范围包含主数据、全文检索 token、图片文件和向量记录。图片 key 需要先校验，
   * 防止误删非 dataset 来源的 S3 对象。
   */
  async delete(data: DeleteDatasetDataProps, session?: ClientSession) {
    await this.commitDataWrite({
      session,
      fn: async (session) => {
        await MongoDatasetData.deleteOne({ _id: data.id }, { session });
        await MongoDatasetTraining.deleteMany({ dataId: data.id }, { session });
        // getFullTextStore() 按引擎分发:mongo 删除 dataset_data_texts;milvus 为 no-op(全文行随向量删除清理)。
        await getFullTextStore().deleteByDataId(data.id, session);

        // 主数据删除后清理图片对象，避免孤儿文件继续占用存储。
        // 仅删除归属于该数据块 dataset 的 key，避免脏数据里的外库 key 触发跨库物理删除。
        if (
          data.imageId &&
          isS3ObjectKey(data.imageId, 'dataset') &&
          isAuthorizedDatasetFileS3Key({ key: data.imageId, datasetId: data.datasetId })
        ) {
          await getS3DatasetSource().deleteDatasetFileByKey(data.imageId);
        }

        // data.indexes 中的 dataId 即向量 id，删除数据时需要全部清理。
        await this.indexOperation.deleteVectors({
          teamId: data.teamId,
          idList: data.indexes.map((item) => item.dataId)
        });
      }
    });

    this.pushCollectionUpdate({
      collectionId: data.collectionId,
      datasetId: data.datasetId,
      teamId: data.teamId
    });
  }
}

/**
 * 创建 dataset data 的服务函数。
 * 可复用调用方 session，或由调用方通过 commit 回调组合其他记录的原子提交。
 */
export const createDatasetData = async (
  props: CreateDatasetDataPropsType &
    DatasetDataWriteOptions & {
      embeddingModel: EmbeddingModelDataType;
      indexSize?: number;
      imageIndex?: boolean;
      imageDescMap?: Record<string, string>;
    }
) => {
  return new DatasetDataOperation(props.embeddingModel).create(props);
};

/**
 * 按完整 indexes 更新 dataset data。
 * 适用于调用方显式提交整组索引的场景。
 */
export const updateDatasetDataByIndexes = async (props: UpdateDatasetDataByIndexesProps) => {
  return new DatasetDataOperation(props.model).updateByIndexes(props);
};

/** 重新向量化 data 中已存的 indexes；正文和索引生成策略不参与 rebuild。 */
export const rebuildDatasetDataIndexes = async (props: RebuildDatasetDataIndexesProps) => {
  return new DatasetDataOperation(props.model).rebuildIndexes(props);
};

/**
 * 根据数据内容更新系统索引，同时保留外部索引。
 * 系统索引包含 default 文本索引和 imageEmbedding 图片向量索引。
 */
export const updateDatasetDataSystemIndexes = async (
  props: UpdateDatasetDataSystemIndexesProps
) => {
  return new DatasetDataOperation(props.model).updateSystemIndexes(props);
};

/**
 * 删除 dataset data 及其全文索引、图片和向量等派生资源，可复用上层事务。
 */
export const deleteDatasetData = async (data: DeleteDatasetDataProps, session?: ClientSession) => {
  return new DatasetDataOperation().delete(data, session);
};
