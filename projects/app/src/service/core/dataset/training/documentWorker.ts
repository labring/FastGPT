import { randomUUID } from 'node:crypto';
import {
  datasetTrainingMQService,
  type DatasetTrainingJobData
} from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import type { Job, Worker } from '@fastgpt/dal/redis/bullmq/types';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { isImageEmbeddingModel } from '@fastgpt/global/core/ai/model/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  datasetDataDocumentTrainingStatusByMode,
  isDatasetDataDocumentTrainingStatus,
  isDatasetDataModelRebuild,
  isDatasetDataSynonymRebuild
} from '@fastgpt/global/core/dataset/data/utils';
import { getLLMMaxChunkSize, getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import type { AdminDatasetTrainingEnhanceResponse } from '@fastgpt/global/openapi/admin/dataset/training/api';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import {
  bridgeClientSessionToDbSession,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import {
  getSystemInstanceConfig,
  onSystemInstanceConfigSnapshot
} from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { isProVersion } from '@fastgpt/service/common/system/constants';
import { isEmbeddingRequestError } from '@fastgpt/service/core/ai/embedding/error';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getRunnableDatasetIndexMatch } from '@fastgpt/service/core/dataset/data/query';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { cleanupUnusedDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/controller';
import { getDatasetSynonymTransformContext } from '@fastgpt/service/core/dataset/synonym/entity';
import {
  createPendingDatasetData,
  createQaTrainingData
} from '@fastgpt/service/core/dataset/training/orchestration';
import {
  claimDatasetTrainingRun,
  clearDatasetTrainingProgress,
  getMongoTrainingRunMatch,
  lockDatasetTrainingRun,
  markDatasetTrainingItemRunning,
  pauseDatasetTrainingRun,
  type DatasetTrainingRun
} from '@fastgpt/service/core/dataset/training/mongo/progress';
import {
  enqueueDatasetTrainingBatch,
  settleDatasetTrainingRoundAfterWrite
} from '@fastgpt/service/core/dataset/training/runtime';
import {
  filterTrainingDataList,
  prepareDatasetIndexTrainingChunks
} from '@fastgpt/service/core/dataset/training/utils';
import { serviceEnv } from '@fastgpt/service/env';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { postDatasetTrainingEnhance } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import {
  rebuildDatasetDataIndexes,
  updateDatasetDataByIndexes
} from '@/service/core/dataset/data/data';
import {
  getDatasetParseQuotaErrorCode,
  prepareDatasetCollectionParse
} from '@/service/core/dataset/queues/datasetParse';
import { generateDatasetQa } from '@/service/core/dataset/queues/generateQA';
import { getIndexTrainingBaseIndexes } from '@/service/core/dataset/queues/indexInput';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);
const maxItemsPerJob = 128;

class DocumentTrainingRunLostError extends Error {}
class DocumentTrainingCommitError extends Error {}

const getWorkScope = (
  collection: Pick<DatasetCollectionSchemaType, '_id' | 'teamId' | 'datasetId'>
) => ({
  collectionId: collection._id,
  teamId: collection.teamId,
  datasetId: collection.datasetId
});

/** 新 Worker 仅领取文档训练阶段，失败分块保留在本轮等待重试。 */
const getRunnableIndexWork = (scope: ReturnType<typeof getWorkScope>) => ({
  ...scope,
  ...getRunnableDatasetIndexMatch(serviceEnv.DATASET_SYNONYM_ENABLED)
});

/** Job 完成和周期对账共用。补投仍可执行的工作，或在集合事务锁保护下结束空训练轮次。 */
export const reconcileDatasetTraining = async (collectionId: string): Promise<void> => {
  const activeCollection = { _id: collectionId, 'training.status': 'active' };
  const collection = await MongoDatasetCollection.findOne(activeCollection, {
    _id: 1,
    teamId: 1,
    datasetId: 1,
    training: 1
  })
    .read('primary')
    .lean();
  if (!collection?.training) return;

  const scope = getWorkScope(collection);
  const dataset = await MongoDataset.exists({
    _id: collection.datasetId,
    teamId: collection.teamId,
    deleteTime: null
  }).read('primary');
  if (!dataset) return;

  const hasRunnableWork = async (
    indexWork: ReturnType<typeof getRunnableIndexWork>,
    session: ClientSession | null = null
  ) =>
    Boolean(
      (await datasetQaTrainingService.exists({
        teamId: String(scope.teamId),
        datasetId: String(scope.datasetId),
        collectionId: String(scope.collectionId),
        status: 'active',
        tx: bridgeClientSessionToDbSession(session)
      })) || (await MongoDatasetData.exists(indexWork).read('primary').session(session))
    );

  const shouldEnqueue =
    collection.training.parse?.status === 'active' ||
    (await hasRunnableWork(getRunnableIndexWork(scope))) ||
    (await mongoSessionRun(async (session) => {
      // 只有错误项或者全部完成时才进入写事务。和追加使用同一个文档的写锁，避免清掉新一轮工作。
      const locked = await MongoDatasetCollection.findOneAndUpdate(
        activeCollection,
        { $inc: { 'training.revision': 1 } },
        { new: true, session }
      ).lean();
      if (!locked?.training) return false;

      const indexWork = getRunnableIndexWork(scope);
      if (
        locked.training.parse?.status === 'active' ||
        (await hasRunnableWork(indexWork, session))
      ) {
        return true;
      }
      await settleDatasetTrainingRoundAfterWrite(scope, bridgeClientSessionToDbSession(session));
      // 最后一块提交后进程中断时，对账仍可回收旧词表，包括只剩其他错误项的轮次。
      await cleanupUnusedDatasetSynonymMappings(
        { teamId: String(scope.teamId), datasetId: String(scope.datasetId) },
        session
      );
      return false;
    }));

  if (shouldEnqueue) {
    await enqueueDatasetTrainingBatch({
      collectionIds: [collectionId],
      teamId: String(collection.teamId)
    });
  }
};

let concurrencyUpdate = Promise.resolve();
let unsubscribeSnapshot: (() => void) | undefined;

/** 快照可能连续下发；串行写入全局和本进程配置，避免旧快照最后覆盖新值。 */
const applyTrainingConcurrency = (concurrency: number) => {
  const updated = concurrencyUpdate.then(async () => {
    await datasetTrainingMQService.getQueue().setGlobalConcurrency(concurrency);
    const worker = datasetTrainingMQService.getWorker(
      (job) => processDatasetTraining(job.data.collectionId),
      concurrency
    );
    worker.off('completed', onTrainingCompleted).on('completed', onTrainingCompleted);
    return worker;
  });
  concurrencyUpdate = updated.then(
    () => undefined,
    () => undefined
  );
  return updated;
};

/** 注册文档 Worker，并根据文档并发配置热更集群和本进程。 */
export const initDatasetTrainingWorker = (): Promise<Worker<DatasetTrainingJobData>> => {
  unsubscribeSnapshot ??= onSystemInstanceConfigSnapshot((snapshot) => {
    void applyTrainingConcurrency(snapshot.performance.dataset.documentMaxProcess).catch(
      (error) => {
        logger.warn('Failed to reload dataset training concurrency', { error });
      }
    );
  });
  return applyTrainingConcurrency(getSystemInstanceConfig().performance.dataset.documentMaxProcess);
};

function onTrainingCompleted(job: Job<DatasetTrainingJobData>) {
  void reconcileDatasetTraining(job.data.collectionId).catch((error) => {
    logger.error('Failed to reconcile completed dataset training', {
      collectionId: job.data.collectionId,
      error
    });
  });
}

type DocumentTrainingContext = {
  collection: DatasetCollectionSchemaType;
  dataset: DatasetSchemaType;
  scope: ReturnType<typeof getWorkScope>;
  ownership: DatasetTrainingRun;
  teamId: string;
  usageId: string;
  documentChunkMaxProcess: number;
};

/** 一次 Job 先解析、再处理有限 QA 和索引工作，提交只接受当前 runId。 */
async function processDatasetTraining(collectionId: string) {
  const runId = randomUUID();
  const ownership = { collectionId, runId };
  const collection = await claimDatasetTrainingRun(ownership);
  if (!collection?.training) return;

  try {
    const dataset = await MongoDataset.findOne({
      _id: collection.datasetId,
      teamId: collection.teamId,
      deleteTime: null
    })
      .read('primary')
      .lean();
    if (!dataset) return;

    const context: DocumentTrainingContext = {
      collection,
      dataset,
      scope: getWorkScope(collection),
      ownership,
      teamId: String(collection.teamId),
      usageId: collection.training.usageId,
      documentChunkMaxProcess: getSystemInstanceConfig().performance.dataset.documentChunkMaxProcess
    };

    if (!(await processParse(context))) return;
    const remainingBudget = await processQa(context);
    if (remainingBudget > 0) await processIndexes(context, remainingBudget);
  } finally {
    await clearDatasetTrainingProgress({ run: ownership }).catch((error) => {
      logger.error('Failed to clear document training progress', { collectionId, runId, error });
    });
  }
}

/** 解析文件并写入下游待办，解析失败后仍可继续处理独立追加的分块。 */
async function processParse(context: DocumentTrainingContext) {
  const { collection, dataset, scope, ownership, teamId, usageId } = context;
  if (collection.training?.parse?.status !== 'active') return true;
  if (!(await canStartWork(context))) return false;
  const tmbId = String(collection.tmbId);
  const parseMatch = { ...getMongoTrainingRunMatch(ownership), 'training.parse.status': 'active' };
  const prepared = await runItem(ownership, {
    stage: TrainingModeEnum.parse,
    itemId: ownership.collectionId,
    run: () => prepareDatasetCollectionParse({ collection, dataset, teamId, tmbId, usageId }),
    markFailed: async (errorMsg, session) => {
      const { matchedCount } = await MongoDatasetCollection.updateOne(
        parseMatch,
        { $set: { 'training.parse': { status: 'error', errorMsg } } },
        { session }
      );
      return matchedCount > 0;
    }
  });
  if (prepared !== undefined) {
    const synonymVersion =
      prepared && prepared.trainingMode !== TrainingModeEnum.qa
        ? await getSynonymVersion(context)
        : undefined;
    const committed = await writeWhileOwned(ownership, async (session) => {
      const tx = bridgeClientSessionToDbSession(session);
      const { matchedCount } = await MongoDatasetCollection.updateOne(
        parseMatch,
        {
          ...(prepared && { $set: prepared.collectionUpdate }),
          $unset: { 'training.parse': '' }
        },
        { session }
      );
      if (!matchedCount) return false;
      if (!prepared) return true;

      if (prepared.trainingMode === TrainingModeEnum.qa) {
        const sourceChunks = filterTrainingDataList({
          data: prepared.trainingData,
          maxToken: prepared.agentModelData ? getLLMMaxChunkSize(prepared.agentModelData) : Infinity
        });
        await createQaTrainingData({ scope: { ...scope, tmbId }, sourceChunks }, tx);
      } else {
        const indexStatus = datasetDataDocumentTrainingStatusByMode[prepared.trainingMode];
        if (!indexStatus)
          throw new Error(`Unsupported parse output mode: ${prepared.trainingMode}`);
        const data = prepareDatasetIndexTrainingChunks({
          data: prepared.trainingData,
          indexStatus,
          agentModel: prepared.agentModelData,
          vlmModel: prepared.vlmModelData,
          vlmModelConfigured: prepared.vlmModelConfigured,
          supportImageEmbedding: isImageEmbeddingModel(prepared.embeddingModelData)
        });
        await createPendingDatasetData(
          {
            scope: { ...scope, tmbId },
            data,
            indexStatus,
            indexSize: collection.indexSize,
            synonymVersion
          },
          tx
        );
      }
      return true;
    });
    if (!committed) return false;
    if (prepared?.paragraphUsage) await pushLLMTrainingUsage(prepared.paragraphUsage);
    if (prepared?.collectionUpdate.name) collection.name = prepared.collectionUpdate.name;
  }
  return Boolean(await stillOwnsRun(ownership));
}

/** 生成 QA 并返回本次 Job 可用于索引的剩余额度。 */
async function processQa(context: DocumentTrainingContext) {
  const { collection, dataset, scope, ownership, teamId, usageId } = context;

  // 原文成功裂变后立刻删除，子分块和删除在同一事务提交。
  const qaItems = await datasetQaTrainingService.list({
    teamId: String(scope.teamId),
    datasetId: String(scope.datasetId),
    collectionId: String(scope.collectionId),
    status: 'active',
    sort: 'chunkOrder',
    limit: maxItemsPerJob
  });
  const processItem = async (item: (typeof qaItems)[number]) => {
    const generated = await runItem(ownership, {
      stage: TrainingModeEnum.qa,
      itemId: String(item._id),
      run: async () => {
        const handle = await getTeamModelHandle({ teamId });
        const model = handle.getModelData(getDatasetModelReference(dataset, 'agent'), {
          type: 'llm'
        });
        const result = await generateDatasetQa({
          teamId,
          text: item.q,
          qaPrompt: collection.qaPrompt,
          model
        });
        const chunks = result.chunks.filter(({ q }) => Boolean(q));
        if (!chunks.length) throw new Error('QA 未生成有效结果');
        return { chunks, model, usage: result.usage };
      },
      markFailed: async (errorMsg, session) => {
        return datasetQaTrainingService.markFailed({
          teamId: String(scope.teamId),
          datasetId: String(scope.datasetId),
          collectionId: String(scope.collectionId),
          id: String(item._id),
          errorMsg,
          tx: bridgeClientSessionToDbSession(session)
        });
      }
    });
    if (!generated) return;

    const synonymVersion = await getSynonymVersion(context);
    const committed = await writeWhileOwned(ownership, async (session) => {
      const tx = bridgeClientSessionToDbSession(session);
      const deletedCount = await datasetQaTrainingService.deleteOne({
        id: String(item._id),
        teamId: String(scope.teamId),
        datasetId: String(scope.datasetId),
        collectionId: String(scope.collectionId),
        status: 'active',
        tx
      });
      if (deletedCount !== 1) return false;
      await createPendingDatasetData(
        {
          scope: { ...scope, tmbId: String(item.tmbId) },
          data: generated.chunks.map((chunk) => ({
            ...chunk,
            chunkIndex: item.chunkIndex,
            metadata: item.dataMetadata
          })),
          indexStatus: DatasetDataIndexStageEnum.index,
          synonymVersion
        },
        tx
      );
      return true;
    });
    if (committed) {
      await pushLLMTrainingUsage({
        teamId,
        model: generated.model,
        ...generated.usage,
        usageId,
        type: UsageItemTypeEnum.training_qa
      });
    }
  };

  const qaFinished = await processItems(context, { items: qaItems, processItem });
  return qaFinished ? maxItemsPerJob - qaItems.length : 0;
}

/** 在剩余额度内完成分块增强、首次索引或重建。 */
async function processIndexes(context: DocumentTrainingContext, remainingBudget: number) {
  const { collection, dataset, scope, ownership, teamId, usageId } = context;
  const pendingIndex = getRunnableIndexWork(scope);

  const itemProjection = {
    _id: 1,
    tmbId: 1,
    q: 1,
    a: 1,
    imageId: 1,
    imageDescMap: 1,
    draftIndexes: 1,
    indexStatus: 1,
    trainingIndexSize: 1
  } as const;

  // 索引与 QA 共享切片预算。新建 QA 子块已提交，可以马上进入索引。
  const indexItems = await MongoDatasetData.find(pendingIndex, itemProjection)
    .read('primary')
    .sort({ _id: 1 })
    .limit(remainingBudget)
    .lean();
  const processIndexItem = async (item: (typeof indexItems)[number]) => {
    // 同一分块可连续完成图片、自动增强后再写索引，只占本轮一个分块名额。
    while (
      isDatasetDataDocumentTrainingStatus(item.indexStatus) &&
      item.indexStatus !== DatasetDataIndexStageEnum.index
    ) {
      const stage = item.indexStatus;
      const result = await runItem<AdminDatasetTrainingEnhanceResponse>(ownership, {
        stage: TrainingModeEnum[stage],
        itemId: String(item._id),
        run: async () => {
          if (
            !isProVersion() ||
            getSystemInstanceConfig().license.data?.functions?.datasetEnhance === false
          ) {
            return { status: 'skipped', reason: 'license' };
          }
          const handle = await getTeamModelHandle({ teamId });
          const model = handle.findModelData(
            getDatasetModelReference(
              dataset,
              stage === DatasetDataIndexStageEnum.auto ? 'agent' : 'vlm'
            ),
            {
              type: ModelTypeEnum.llm,
              ...(stage !== DatasetDataIndexStageEnum.auto && { vision: true })
            }
          );
          if (!model?.modelId) return { status: 'skipped' };

          const common = {
            teamId,
            datasetId: String(scope.datasetId),
            collectionId: String(scope.collectionId),
            dataId: String(item._id),
            runId: ownership.runId,
            modelId: model.modelId,
            usageId
          };
          if (stage === DatasetDataIndexStageEnum.imageParse) {
            if (!item.imageId) return { status: 'skipped' };
            return postDatasetTrainingEnhance({
              ...common,
              mode: stage,
              imageId: item.imageId
            });
          }
          if (stage === DatasetDataIndexStageEnum.image) {
            return postDatasetTrainingEnhance({
              ...common,
              mode: stage,
              q: item.q,
              autoIndexes: collection.autoIndexes
            });
          }
          return postDatasetTrainingEnhance({ ...common, mode: stage, q: item.q, a: item.a });
        },
        skipOnFailure: { status: 'skipped' }
      });
      if (!result || result.status === 'aborted') return;

      if (result.status === 'committed') {
        // Pro 已在原子事务内推进该分块阶段并登记用量，回读主库最新状态以进入下一阶段。
        const reloaded = await MongoDatasetData.findOne(
          { ...pendingIndex, _id: item._id },
          itemProjection
        )
          .read('primary')
          .lean();
        if (!reloaded) return;
        Object.assign(item, reloaded);
        continue;
      }

      const licenseUnavailable = result.reason === 'license';
      const patch = {
        indexStatus:
          stage === DatasetDataIndexStageEnum.image && collection.autoIndexes && !licenseUnavailable
            ? DatasetDataIndexStageEnum.auto
            : DatasetDataIndexStageEnum.index
      };

      const transitioned = await writeWhileOwned(ownership, async (session) => {
        const { matchedCount } = await MongoDatasetData.updateOne(
          { ...pendingIndex, _id: item._id, indexStatus: stage },
          { $set: patch },
          { session }
        );
        return matchedCount > 0;
      });
      if (!transitioned) return;

      Object.assign(item, patch);
    }

    const nextStatus = {
      [DatasetDataIndexStageEnum.rebuildIndexPending]:
        DatasetDataIndexStageEnum.rebuildIndexRunning,
      [DatasetDataIndexStageEnum.rebuildSynonymPending]:
        DatasetDataIndexStageEnum.rebuildSynonymRunning
    };
    const previousStatus = item.indexStatus;
    if (
      previousStatus === DatasetDataIndexStageEnum.rebuildIndexPending ||
      previousStatus === DatasetDataIndexStageEnum.rebuildSynonymPending
    ) {
      const running = nextStatus[previousStatus];
      const claimed = await writeWhileOwned(ownership, async (session) => {
        const { matchedCount } = await MongoDatasetData.updateOne(
          { ...pendingIndex, _id: item._id, indexStatus: previousStatus },
          { $set: { indexStatus: running } },
          { session }
        );
        return matchedCount > 0;
      });
      if (!claimed) return;
      item.indexStatus = running;
    }

    const status = item.indexStatus;
    const diffSynonym = isDatasetDataSynonymRebuild(status);
    const rebuildModel = isDatasetDataModelRebuild(status);
    const itemMatch = { ...pendingIndex, _id: item._id, indexStatus: status };
    const indexed = await runItem(ownership, {
      stage: diffSynonym
        ? TrainingModeEnum.rebuildSynonym
        : rebuildModel
          ? TrainingModeEnum.rebuildIndex
          : TrainingModeEnum.index,
      itemId: String(item._id),
      run: async () => {
        const modelHandle = await getTeamModelHandle({ teamId });
        const model = modelHandle.getModelData(getDatasetModelReference(dataset, 'embedding'), {
          type: 'embedding'
        });
        const commit = async (write: (session: ClientSession) => Promise<void>) => {
          const committed = await writeWhileOwned(ownership, async (session) => {
            if (!(await MongoDatasetData.exists(itemMatch).session(session))) return false;
            await write(session);
            return true;
          }).catch((cause) => {
            throw new DocumentTrainingCommitError('Dataset index commit failed', { cause });
          });
          if (!committed) throw new DocumentTrainingRunLostError();
        };
        if (rebuildModel || diffSynonym) {
          const { tokens } = await rebuildDatasetDataIndexes({
            dataId: String(item._id),
            model,
            diffSynonym,
            commit
          });
          return { model, tokens };
        }
        const indexes = await getIndexTrainingBaseIndexes({
          teamId,
          dataset,
          collection,
          indexes: item.draftIndexes
        });
        const { tokens } = await updateDatasetDataByIndexes({
          dataId: String(item._id),
          q: item.q,
          a: item.a,
          imageId: item.imageId,
          imageDescMap: item.imageDescMap,
          indexes,
          model,
          imageIndex: collection.imageIndex,
          indexSize: item.trainingIndexSize || getMaxIndexSize(model),
          indexPrefix: collection.indexPrefixTitle ? `# ${collection.name}` : undefined,
          commit
        });
        return { model, tokens };
      },
      markFailed: async (errorMsg, session) => {
        const { matchedCount } = await MongoDatasetData.updateOne(
          itemMatch,
          { $set: { indexError: true, indexErrorMsg: errorMsg } },
          { session }
        );
        return matchedCount > 0;
      }
    });
    if (indexed) {
      pushGenerateVectorUsage({
        teamId,
        tmbId: String(item.tmbId),
        inputTokens: indexed.tokens,
        model: indexed.model,
        usageId
      });
    }
  };

  await processItems(context, { items: indexItems, processItem: processIndexItem });
  if (indexItems.some(({ indexStatus }) => isDatasetDataSynonymRebuild(indexStatus))) {
    await cleanupUnusedDatasetSynonymMappings({ teamId, datasetId: String(scope.datasetId) });
  }
}

async function processItems<T>(
  context: DocumentTrainingContext,
  { items, processItem }: { items: T[]; processItem: (item: T) => Promise<void> }
) {
  const { documentChunkMaxProcess } = context;
  for (let start = 0; start < items.length; start += documentChunkMaxProcess) {
    if (!(await canStartWork(context))) return false;
    // 等待已经开始的调用返回再让 BullMQ 归还槽位。
    const batch = items.slice(start, start + documentChunkMaxProcess);
    const results = await Promise.allSettled(batch.map(processItem));
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
  }
  return true;
}

/** 处理单项业务重试、失败标记与欠费暂停。 */
async function runItem<T>(
  ownership: DatasetTrainingRun,
  {
    stage,
    itemId,
    run,
    markFailed,
    skipOnFailure
  }: {
    stage: TrainingModeEnum;
    itemId: string;
    run: () => Promise<T>;
  } & (
    | {
        markFailed: (errorMsg: string, session: ClientSession) => Promise<boolean>;
        skipOnFailure?: never;
      }
    | { markFailed?: never; skipOnFailure: T }
  )
): Promise<T | undefined> {
  const { collectionId } = ownership;
  // 重建分块已有单独的 Running 状态。其他阶段只标记进入 Worker 调用的工作项。
  const trackProgress =
    stage !== TrainingModeEnum.rebuildIndex && stage !== TrainingModeEnum.rebuildSynonym;
  if (trackProgress && !(await markDatasetTrainingItemRunning({ run: ownership, itemId, stage })))
    return;

  try {
    return await runWithRetries();
  } finally {
    if (trackProgress) {
      // 进度清理失败仍须返回已提交结果，切片收尾或接管会清空本次标记。
      await clearDatasetTrainingProgress({ run: ownership, itemId }).catch((error) =>
        logger.error('Failed to clear training item progress', { collectionId, itemId, error })
      );
    }
  }

  async function runWithRetries(): Promise<T | undefined> {
    for (let attempt = 0; ; attempt++) {
      if (!(await stillOwnsRun(ownership))) return;

      try {
        return await run();
      } catch (error) {
        if (error instanceof DocumentTrainingRunLostError) {
          logger.info('Document training commit rejected after losing runId', {
            collectionId,
            stage,
            itemId
          });
          return;
        }
        // MongoDB / 全文索引故障由对账重投，业务调用重试耗尽才标记该条分块错误。
        if (error instanceof DocumentTrainingCommitError) throw error.cause;
        const quotaError = getDatasetParseQuotaErrorCode(error);
        if (quotaError === TeamErrEnum.aiPointsNotEnough) {
          await pauseDatasetTrainingRun(ownership);
          return;
        }
        if (
          attempt < 2 &&
          !quotaError &&
          !isModelConfigError(error) &&
          (!isEmbeddingRequestError(error) || error.retryable)
        ) {
          await delay(500);
          continue;
        }

        if (!markFailed) {
          logger.warn('Optional document enhancement skipped after retries', {
            collectionId,
            stage,
            itemId,
            error
          });
          return skipOnFailure;
        }
        logger.error('Document training item failed', { collectionId, stage, itemId, error });
        const errorMsg = getErrText(error, `Dataset ${stage} training failed`);
        await writeWhileOwned(ownership, (session) => markFailed(errorMsg, session));
        return;
      }
    }
  }
}

async function canStartWork({ ownership, teamId }: DocumentTrainingContext) {
  if (!(await stillOwnsRun(ownership))) return false;
  try {
    await checkTeamAIPoints(teamId);
    return true;
  } catch (error) {
    if (error !== TeamErrEnum.aiPointsNotEnough) throw error;
    await pauseDatasetTrainingRun(ownership);
    return false;
  }
}

function stillOwnsRun(ownership: DatasetTrainingRun) {
  return MongoDatasetCollection.exists(getMongoTrainingRunMatch(ownership)).read('primary');
}

function writeWhileOwned(
  ownership: DatasetTrainingRun,
  write: (session: ClientSession) => Promise<boolean>
) {
  return mongoSessionRun(async (session) => {
    // 和追加、暂停、重新领取争用同一集合写锁，旧 Worker 不能提交任何子记录。
    return (
      (await lockDatasetTrainingRun(ownership, bridgeClientSessionToDbSession(session))) &&
      (await write(session))
    );
  });
}

async function getSynonymVersion({ teamId, scope }: DocumentTrainingContext) {
  return serviceEnv.DATASET_SYNONYM_ENABLED
    ? (await getDatasetSynonymTransformContext({ teamId, datasetId: String(scope.datasetId) }))
        ?.version
    : undefined;
}
