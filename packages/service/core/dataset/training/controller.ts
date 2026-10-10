import { getTrainingDataIndexStatuses } from './utils';
import { MongoDatasetTraining } from './schema';
import type {
  PushDataChunkType,
  PushDataResponseType
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '../../../common/mongo';
import { isImageEmbeddingModel } from '../../ai/model';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getLLMMaxChunkSize } from '../../../../global/core/dataset/training/utils';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { checkTimerLock, deleteTimerLock } from '../../../common/system/timerLock/utils';
import { BLOCKED_LOCK_TIME } from './query';
import { MongoDatasetData } from '../data/schema';
import { isS3ObjectKey, removeS3TTL } from '../../../common/s3/utils';
import { getDatasetSynonymTransformContext, isDatasetSynonymEnabled } from '../synonym/entity';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

/** 队列内部使用的数据类型：对外 API（PushDataChunkSchema）不开放 dataId。 */
export type PushDataChunkWithDataIdType = PushDataChunkType & {
  /** 提前落库数据的 _id，写入训练任务用于下游定位同一条数据。 */
  dataId?: string;
};

/** 各训练阶段的分块上限与权重，预落库与队列写入共用同一份口径。 */
const getTrainingModeLimit = async ({
  mode,
  agentModel,
  vectorModel,
  vlmModel,
  vlmModelConfigured
}: {
  mode: TrainingModeEnum;
  agentModel?: LLMSystemModelDataType;
  vectorModel: EmbeddingSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
  vlmModelConfigured: boolean;
}): Promise<{ maxToken: number; weight: number }> => {
  if (
    [
      TrainingModeEnum.rebuildIndex,
      TrainingModeEnum.rebuildSynonym,
      TrainingModeEnum.index
    ].includes(mode)
  ) {
    return {
      maxToken: Infinity,
      weight: vectorModel.config.weight
    };
  }
  if (mode === TrainingModeEnum.qa || mode === TrainingModeEnum.auto) {
    return {
      maxToken: agentModel ? getLLMMaxChunkSize(agentModel) : Infinity,
      weight: 0
    };
  }
  if (mode === TrainingModeEnum.image || mode === TrainingModeEnum.imageParse) {
    const vllmModelData = vlmModel;
    if (!vlmModelConfigured) {
      if (mode === TrainingModeEnum.image && isImageEmbeddingModel(vectorModel)) {
        return {
          maxToken: Infinity,
          weight: vectorModel.config.weight
        };
      }
      return Promise.reject(i18nT('common:error_vlm_not_config'));
    }
    return {
      maxToken: vllmModelData ? getLLMMaxChunkSize(vllmModelData) : Infinity,
      weight: 0
    };
  }

  return Promise.reject(`Training mode "${mode}" is inValid`);
};

/** 过滤空内容与超长内容。预落库必须在建数据行之前调用，避免写入无人处理的数据。 */
const filterTrainingDataList = <T extends { q?: string; a?: string; imageId?: string }>({
  data,
  maxToken
}: {
  data: T[];
  maxToken: number;
}) =>
  data.filter((item) => {
    const q = item.q || '';
    const a = item.a || '';

    // filter repeat content
    if (!item.imageId && !q) {
      return;
    }

    const text = q + a;

    // Oversize llm tokens
    if (text.length > maxToken) {
      return;
    }

    return true;
  });

/** 欠费分批暂停训练；重建 data 同事务标记失败，普通训练保留 data 状态和原 TTL。 */
export const lockTrainingDataByTeamId = async (
  teamId: string,
  currentTrainingId?: string
): Promise<any> => {
  const timerId = `lock_training_data--${teamId}`;
  const errorMsg = i18nT('common:code_error.team_error.ai_points_not_enough');

  // 每批同时更新任务和关联重建 data，避免状态统计仍把已暂停的任务计入处理中。
  const pauseTasks = async (currentOnly = false) => {
    if (currentOnly && !currentTrainingId) return;
    let afterId: string | undefined;
    while (true) {
      const batch = await mongoSessionRun(async (session) => {
        const tasks = await MongoDatasetTraining.find({
          teamId,
          ...(currentOnly
            ? { _id: currentTrainingId }
            : {
                $or: [
                  { retryCount: { $gt: 0 } },
                  ...(currentTrainingId ? [{ _id: currentTrainingId }] : [])
                ],
                ...(afterId && { _id: { $gt: afterId } })
              })
        })
          .select('_id mode dataId datasetId collectionId')
          .sort({ _id: 1 })
          .limit(300)
          .session(session)
          .lean();
        if (!tasks.length) return tasks;
        await MongoDatasetTraining.updateMany(
          { teamId, _id: { $in: tasks.map(({ _id }) => _id) } },
          { $set: { lockTime: BLOCKED_LOCK_TIME, errorMsg } },
          { session }
        );
        // 重建失败需要用户处理，保留任务避免 TTL 删除后只剩 data 的失败状态。
        const rebuildIds = tasks
          .filter((task) =>
            [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(task.mode)
          )
          .map(({ _id }) => _id);
        if (rebuildIds.length) {
          await MongoDatasetTraining.updateMany(
            { teamId, _id: { $in: rebuildIds } },
            { $set: { expireAt: null } },
            { session }
          );
        }
        const updates = tasks.flatMap((task) =>
          [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(task.mode) &&
          task.dataId
            ? [
                {
                  updateOne: {
                    filter: {
                      _id: task.dataId,
                      teamId,
                      datasetId: task.datasetId,
                      collectionId: task.collectionId,
                      indexStatus: getTrainingDataIndexStatuses(task.mode).running
                    },
                    update: {
                      $set: {
                        indexStatus: getTrainingDataIndexStatuses(task.mode).failed,
                        indexErrorMsg: errorMsg
                      }
                    }
                  }
                }
              ]
            : []
        );
        if (updates.length) await MongoDatasetData.bulkWrite(updates, { session });
        return tasks;
      });
      if (!batch.length || currentOnly) return;
      afterId = String(batch[batch.length - 1]._id);
    }
  };

  // 并发/多节点调用时，只有首个抢到锁的会批量更新；30 分钟 TTL 仅用于定时锁兜底。
  const acquired = await checkTimerLock({ timerId, lockMinuted: 30 });
  if (!acquired) {
    // 其它 worker 已在执行团队级锁定时，当前已领取任务仍需要单独标记，避免最后一次重试被扣到 0 后不可见。
    await pauseTasks(true).catch((error) => {
      logger.error('lock current training data failed', { teamId, currentTrainingId, error });
    });
    return;
  }

  try {
    await pauseTasks();
  } catch (error) {
    logger.error('lockTrainingDataByTeamId failed', { teamId, error });
  } finally {
    // 执行完立即释放锁
    await deleteTimerLock({ timerId }).catch(() => {});
  }
};

/**
 * 按训练阶段写入待处理数据。辅助模型对象只用于分块上限，缺失时不额外丢弃上游已分块的数据。
 * 解析队列可显式传入 VLM 配置状态，将可用性校验留给实际图片处理阶段；其他调用方保持原有检查。
 */
export const pushDataListToTrainingQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModel,
  vectorModel,
  vlmModel,
  vlmModelConfigured = !!vlmModel,
  data,
  billId,
  mode = TrainingModeEnum.index,
  indexSize,
  auditTaskId,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;

  data: PushDataChunkWithDataIdType[];
  mode?: TrainingModeEnum;

  agentModel?: LLMSystemModelDataType;
  vectorModel: EmbeddingSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
  /** 是否配置了 VLM 引用，不代表模型当前可用；未传时沿用模型对象是否存在的判断。 */
  vlmModelConfigured?: boolean;

  indexSize?: number;
  auditTaskId?: string;

  billId: string;
  session?: ClientSession;
}): Promise<PushDataResponseType> => {
  const vectorModelData = vectorModel;
  const agentModelData = agentModel;

  const { maxToken, weight } = await getTrainingModeLimit({
    mode,
    agentModel: agentModelData,
    vectorModel: vectorModelData,
    vlmModel,
    vlmModelConfigured
  });

  // format q and a, remove empty char
  data = filterTrainingDataList({ data, maxToken });

  // insert data to db
  const batchSize = 500; // Batch insert size
  const maxBatchesPerTransaction = 20; // Every session can insert at most 20 batches

  const insertDataIterative = async (
    dataToInsert: typeof data,
    session: ClientSession
  ): Promise<number> => {
    let insertedCount = 0;

    for (let i = 0; i < dataToInsert.length; i += batchSize) {
      const batch = dataToInsert.slice(i, i + batchSize);

      if (batch.length === 0) continue;

      const result = await MongoDatasetTraining.insertMany(
        batch.map((item) => ({
          teamId,
          tmbId,
          datasetId,
          collectionId,
          billId,
          mode,
          ...(item.q && { q: item.q }),
          ...(item.a && { a: item.a }),
          ...(item.imageId && { imageId: item.imageId }),
          ...(item.dataId && { dataId: item.dataId }),
          ...(item.metadata && { dataMetadata: item.metadata }),
          chunkIndex: item.chunkIndex ?? 0,
          indexSize,
          weight: weight ?? 0,
          indexes: item.indexes,
          retryCount: 3,
          ...(auditTaskId && { auditTaskId })
        })),
        {
          session,
          ordered: true, // 改为 true: 任何失败立即停止,事务回滚
          rawResult: true,
          includeResultMetadata: false
        }
      );

      // ordered: true 模式下,成功必定等于批次大小
      insertedCount += result.insertedCount;

      logger.debug('Training data insert progress', {
        insertedCount,
        total: dataToInsert.length
      });
    }

    return insertedCount;
  };

  // 大数据量分段事务处理 (避免事务超时)
  const chunkSize = maxBatchesPerTransaction * batchSize; // 10,000 条
  const start = Date.now();

  if (data.length > chunkSize) {
    logger.info('Large dataset detected, using chunked transactions', {
      itemCount: data.length,
      chunkSize
    });

    // 预落库会把数据行和训练任务放在调用方事务中。此时不能再开启独立事务，
    // 否则训练任务可能先提交而数据行随后回滚，留下无法处理的孤儿任务。
    if (session) {
      const insertedCount = await insertDataIterative(data, session);
      logger.info('Large dataset inserted in caller transaction', {
        durationMs: Date.now() - start
      });
      return { insertLen: insertedCount, dataIds: [] };
    }

    let totalInserted = 0;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);

      await retryFn(async () => {
        const inserted = await mongoSessionRun(async (chunkSession) => {
          return insertDataIterative(chunk, chunkSession);
        });
        totalInserted += inserted;
      });
    }

    logger.info('Chunked transactions completed', { durationMs: Date.now() - start });

    return { insertLen: totalInserted, dataIds: [] };
  }

  // 小数据量单事务处理
  if (session) {
    const insertedCount = await insertDataIterative(data, session);
    logger.info('Single transaction completed', { durationMs: Date.now() - start });
    return { insertLen: insertedCount, dataIds: [] };
  } else {
    const insertedCount = await mongoSessionRun(async (session) => {
      return insertDataIterative(data, session);
    });
    logger.info('Single transaction completed', { durationMs: Date.now() - start });
    return { insertLen: insertedCount, dataIds: [] };
  }
};

/** 预落库批量写入的批大小，与训练任务写入保持一致。 */
const preCreateBatchSize = 500;

/**
 * 提前落库：在调用方 session 内先写入 indexing 数据，再创建携带相同 dataId 的训练任务。
 *
 * 数据与任务共享同一 `dataId`，下游按 DS-07 分流把向量结果写回同一条数据，全流程只有一条数据行。
 * 只由解析最终分块、图片导入和问答叶子这几条入口使用，其他 `pushDataListToTrainingQueue` 调用方行为不变。
 *
 * 说明：
 * - 过滤（空内容/超长）在建数据行之前完成，避免写出无人处理的数据。
 * - `indexes` 保持为空：自定义/question/summary/image 索引草稿仍留在训练任务里。
 * - `synonymVersion` 与创建路径同源写入，避免预落库数据被同义词重建误选。
 * - 图片 `imageId` 随数据落库移除临时对象过期设置，避免待索引期间被清理。
 */
export const preCreateDatasetDataAndPushToTrainingQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModel,
  vectorModel,
  vlmModel,
  vlmModelConfigured = !!vlmModel,
  data,
  billId,
  mode = TrainingModeEnum.index,
  indexSize,
  auditTaskId,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;

  data: PushDataChunkType[];
  mode?: TrainingModeEnum;

  agentModel?: LLMSystemModelDataType;
  vectorModel: EmbeddingSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
  vlmModelConfigured?: boolean;

  indexSize?: number;
  auditTaskId?: string;

  billId: string;
  session: ClientSession;
}): Promise<PushDataResponseType> => {
  const { maxToken } = await getTrainingModeLimit({
    mode,
    agentModel,
    vectorModel,
    vlmModel,
    vlmModelConfigured
  });
  const dataList = filterTrainingDataList({ data, maxToken });

  if (dataList.length === 0) {
    return { insertLen: 0, dataIds: [] };
  }

  const synonymContext = isDatasetSynonymEnabled()
    ? await getDatasetSynonymTransformContext({ teamId, datasetId })
    : undefined;

  const dataWithIds: Array<PushDataChunkWithDataIdType> = [];

  for (let i = 0; i < dataList.length; i += preCreateBatchSize) {
    const batch = dataList.slice(i, i + preCreateBatchSize);

    const createdData = await MongoDatasetData.create(
      batch.map((item) => ({
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: item.q || '',
        a: item.a,
        imageId: item.imageId,
        ...(item.metadata && { metadata: item.metadata }),
        chunkIndex: item.chunkIndex ?? 0,
        indexes: [],
        indexStatus: DatasetDataIndexStatusEnum.indexing,
        ...(synonymContext && { synonymVersion: synonymContext.version })
      })),
      { session, ordered: true }
    );

    const imageKeys = batch
      .map((item) => item.imageId)
      .filter((id): id is string => Boolean(id) && isS3ObjectKey(id, 'dataset'));
    if (imageKeys.length > 0) {
      await removeS3TTL({ key: imageKeys, bucketName: 'private', session });
    }

    dataWithIds.push(
      ...createdData.map((item, index) => ({
        ...batch[index],
        dataId: String(item._id)
      }))
    );
  }

  const result = await pushDataListToTrainingQueue({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    agentModel,
    vectorModel,
    vlmModel,
    vlmModelConfigured,
    data: dataWithIds,
    mode,
    indexSize,
    auditTaskId,
    billId,
    session
  });

  return {
    ...result,
    dataIds: dataWithIds.map((item) => item.dataId!).filter(Boolean)
  };
};

export const pushDatasetToParseQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  billId,
  auditTaskId,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
  auditTaskId?: string;
  session: ClientSession;
}) => {
  await MongoDatasetTraining.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.parse,
        ...(auditTaskId && { auditTaskId })
      }
    ],
    { session, ordered: true }
  );
};
