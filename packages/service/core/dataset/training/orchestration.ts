import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';
import type { DatasetDataDocumentTrainingStatus } from '@fastgpt/global/core/dataset/data/utils';
import {
  datasetDataDocumentWorkStatuses,
  rebuildableDatasetDataMatch
} from '@fastgpt/global/core/dataset/data/utils';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import type { DatasetTrainingAppendResultType } from '@fastgpt/global/core/dataset/type';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ApiHttpError } from '../../../common/http/apiError';
import { Types } from '../../../common/mongo';
import { bridgeDbSessionToClientSession } from '../../../common/mongo/sessionRun';
import { isS3ObjectKey, removeS3TTL } from '../../../common/s3/utils';
import {
  createTrainingUsage,
  createTrainingUsages
} from '../../../support/wallet/usage/controller';
import { ensureTrainingUsageItems } from '../../../support/wallet/usage/mongo/training';
import { MongoUsage } from '../../../support/wallet/usage/schema';
import { serviceEnv } from '../../../env';
import { MongoDatasetCollection } from '../collection/schema';
import { persistChunkImageReferences } from '../data/inlineImages/entity';
import { datasetDataTrainingStatusMatch, getRunnableDatasetIndexMatch } from '../data/query';
import { MongoDatasetData } from '../data/schema';
import { getDatasetModelReference } from '../model';
import { MongoDataset } from '../schema';
import { getDatasetSynonymTransformContext } from '../synonym/entity';
import { datasetQaTrainingService } from './qaService';
import { enqueueDatasetTrainingBatch } from './runtime';
import { filterTrainingDataList, prepareDatasetIndexTrainingChunks } from './utils';

/** 预落库一批分块，并在同一事务取消已引用图片的临时过期设置。 */
export const createPendingDatasetData = async (
  input: {
    scope: { teamId: string; tmbId: string; datasetId: string; collectionId: string };
    data: (PushDataChunkType & { indexStatus?: DatasetDataDocumentTrainingStatus })[];
    indexStatus: DatasetDataDocumentTrainingStatus;
    synonymVersion?: number;
    indexSize?: number;
  },
  tx?: DbSession
): Promise<string[]> => {
  if (!tx) {
    return runInTransaction((tx) => createPendingDatasetData(input, tx), { dialect: 'mongo' });
  }
  const { scope, data, indexStatus, synonymVersion, indexSize } = input;
  const session = bridgeDbSessionToClientSession(tx);
  const createdData = await MongoDatasetData.create(
    data.map((item) => ({
      ...scope,
      q: item.q ?? '',
      a: item.a,
      imageId: item.imageId,
      metadata: item.metadata,
      chunkIndex: item.chunkIndex ?? 0,
      draftIndexes: item.indexes?.filter(({ text }) => text !== ''),
      indexStatus: item.indexStatus ?? indexStatus,
      synonymVersion,
      trainingIndexSize: indexSize
    })),
    { session, ordered: true }
  );

  const imageKeys = data
    .map((item) => item.imageId)
    .filter((id): id is string => Boolean(id) && isS3ObjectKey(id, 'dataset'));
  if (imageKeys.length > 0) {
    await removeS3TTL({ key: imageKeys, bucketName: 'private', session });
  }

  return createdData.map(({ _id }) => String(_id));
};

/** 在调用方的事务中保存已通过过滤的 QA 原文。 */
export const createQaTrainingData = async (
  {
    scope,
    sourceChunks
  }: {
    scope: { teamId: string; tmbId: string; datasetId: string; collectionId: string };
    sourceChunks: PushDataChunkType[];
  },
  tx?: DbSession
): Promise<number> => {
  if (sourceChunks.length === 0) return 0;
  const inserted = await datasetQaTrainingService.createMany({
    items: sourceChunks.map(({ q, chunkIndex, metadata }) => ({
      teamId: String(scope.teamId),
      tmbId: String(scope.tmbId),
      datasetId: String(scope.datasetId),
      collectionId: String(scope.collectionId),
      q: q ?? '',
      chunkIndex: chunkIndex ?? 0,
      dataMetadata: metadata,
      status: 'active' as const
    })),
    tx
  });
  return inserted.length;
};

type DatasetTrainingScope = { teamId: string; datasetId: string };

/** 按调用方的分块阶段条件检查知识库训练状态，复用 QA 和解析的判断。 */
const hasDatasetTrainingTaskMatching = async ({
  scope,
  indexStatus,
  tx
}: {
  scope: DatasetTrainingScope;
  indexStatus: typeof datasetDataTrainingStatusMatch.indexStatus;
  tx?: DbSession;
}): Promise<boolean> => {
  const session = bridgeDbSessionToClientSession(tx) ?? null;
  if (
    await MongoDatasetData.exists({ ...scope, indexStatus })
      .read('primary')
      .session(session)
  )
    return true;
  if (
    await datasetQaTrainingService.exists({
      teamId: String(scope.teamId),
      datasetId: String(scope.datasetId),
      tx
    })
  )
    return true;
  return Boolean(
    await MongoDatasetCollection.exists({
      ...scope,
      'training.parse': { $exists: true }
    })
      .read('primary')
      .session(session)
  );
};

/** 查询训练状态时包含旧版重建失败，保证知识库状态和异常列表一致。 */
export const hasDatasetTrainingTask = (scope: DatasetTrainingScope, tx?: DbSession) =>
  hasDatasetTrainingTaskMatching({
    scope,
    indexStatus: datasetDataTrainingStatusMatch.indexStatus,
    tx
  });

/** 检查仍可执行的解析、QA 和分块工作，供知识库同步判断。 */
export const hasActiveDatasetTrainingTask = async (
  scope: DatasetTrainingScope
): Promise<boolean> => {
  const activeRound = { ...scope, 'training.status': 'active' };
  if (
    await MongoDatasetCollection.exists({ ...activeRound, 'training.parse.status': 'active' }).read(
      'primary'
    )
  ) {
    return true;
  }

  const collectionIds = await MongoDatasetCollection.distinct('_id', activeRound).read('primary');
  if (collectionIds.length === 0) return false;

  const workScope = { ...scope, collectionId: { $in: collectionIds } };
  return Boolean(
    (await datasetQaTrainingService.exists({
      teamId: String(scope.teamId),
      datasetId: String(scope.datasetId),
      collectionIds: collectionIds.map(String),
      status: 'active'
    })) ||
    (await MongoDatasetData.exists({
      ...workScope,
      ...getRunnableDatasetIndexMatch(serviceEnv.DATASET_SYNONYM_ENABLED)
    }).read('primary'))
  );
};

/** 保护文档训练的现有工作项，允许新重建处理旧版取消后遗留的失败分块。 */
export const hasBlockingDatasetTrainingTask = (scope: DatasetTrainingScope, tx?: DbSession) =>
  hasDatasetTrainingTaskMatching({
    scope,
    indexStatus: { $in: datasetDataDocumentWorkStatuses },
    tx
  });

type DocumentTrainingAdmission = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId?: string;
  vectorModelId: string;
  agentModelId?: string;
  vlmModelId?: string;
};

/** 在写入工作项的事务内绑定账单并更新集合版本，和 Worker 关账互斥。 */
export const ensureDatasetCollectionTraining = async (
  input: DocumentTrainingAdmission & { hasWork?: boolean; parse?: boolean },
  tx?: DbSession
): Promise<void> => {
  if (!tx) {
    return runInTransaction((tx) => ensureDatasetCollectionTraining(input, tx), {
      dialect: 'mongo'
    });
  }
  const {
    teamId,
    tmbId,
    datasetId,
    collectionId,
    billId,
    vectorModelId,
    agentModelId,
    vlmModelId,
    hasWork = true,
    parse = false
  } = input;
  const session = bridgeDbSessionToClientSession(tx);
  const collectionMatch = { _id: collectionId, teamId, datasetId };
  const requestedBillId = billId?.toLowerCase();
  const invalidBill = () => new ApiHttpError(400, 'Invalid training bill');
  if (requestedBillId !== undefined && !ObjectIdSchema.safeParse(requestedBillId).success) {
    throw invalidBill();
  }
  const collection = await MongoDatasetCollection.findOne(collectionMatch, {
    name: 1,
    training: 1
  })
    .session(session ?? null)
    .lean();
  if (!collection) throw DatasetErrEnum.unExistCollection;

  const existingUsageId = collection.training?.usageId;
  if (existingUsageId && requestedBillId !== undefined && requestedBillId !== existingUsageId) {
    throw new ApiHttpError(409, 'The document already has a training bill');
  }
  if (!hasWork) return;

  const usageItems = { teamId, vectorModelId, agentModelId, vllmModelId: vlmModelId };
  // 关账和追加都写同一个集合文档，并发发生写冲突时由 MongoDB 事务重试。
  if (collection.training) {
    await MongoDatasetCollection.updateOne(
      collectionMatch,
      {
        $inc: { 'training.revision': 1 },
        ...(parse && { $set: { 'training.parse': { status: 'active' } } })
      },
      { session }
    );
    await ensureTrainingUsageItems({ ...usageItems, usageId: collection.training.usageId }, tx);
    return;
  }

  const usageId = await (async () => {
    if (requestedBillId === undefined) {
      const usage = await createTrainingUsage({
        ...usageItems,
        tmbId,
        appName: collection.name,
        billSource: UsageSourceEnum.training,
        trainingCollectionId: collectionId,
        tx
      });
      return usage.usageId;
    }

    // 账单已被绑定过时不能再次用于新轮次。
    const result = await MongoUsage.updateOne(
      {
        _id: requestedBillId,
        teamId,
        source: UsageSourceEnum.training,
        totalPoints: 0,
        trainingCollectionId: { $exists: false },
        $or: [{ datasetId }, { datasetId: { $exists: false } }]
      },
      { $set: { trainingCollectionId: collectionId } },
      { session }
    );
    if (result.matchedCount === 0) throw invalidBill();
    await ensureTrainingUsageItems({ ...usageItems, usageId: requestedBillId }, tx);
    return requestedBillId;
  })();

  await MongoDatasetCollection.updateOne(
    collectionMatch,
    {
      $set: {
        training: {
          status: 'active',
          usageId,
          revision: 1,
          ...(parse && { parse: { status: 'active' } })
        }
      }
    },
    { session }
  );
};

/** 追加普通索引或增强，集合状态和待处理分块一起提交。 */
export const appendDatasetIndexTraining = async (
  {
    data,
    imageUploadKeys,
    indexSize,
    indexStatus = DatasetDataIndexStageEnum.index,
    agentModel,
    vlmModel,
    vlmModelConfigured,
    supportImageEmbedding,
    ...admission
  }: DocumentTrainingAdmission & {
    data: PushDataChunkType[];
    imageUploadKeys?: string[];
    indexSize?: number;
    indexStatus?: DatasetDataDocumentTrainingStatus;
    agentModel?: LLMModelDataType;
    vlmModel?: LLMModelDataType;
    vlmModelConfigured?: boolean;
    supportImageEmbedding?: boolean;
  },
  tx?: DbSession
): Promise<DatasetTrainingAppendResultType> => {
  const dataToIndex = prepareDatasetIndexTrainingChunks({
    data,
    indexStatus,
    agentModel,
    vlmModel,
    vlmModelConfigured,
    supportImageEmbedding
  });
  const { teamId, tmbId, datasetId, collectionId } = admission;

  const append = async (tx: DbSession): Promise<DatasetTrainingAppendResultType> => {
    await ensureDatasetCollectionTraining({ ...admission, hasWork: dataToIndex.length > 0 }, tx);
    if (dataToIndex.length === 0) return { insertLen: 0, dataIds: [] };

    await persistChunkImageReferences({
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(collectionId),
      data: dataToIndex,
      imageUploadKeys,
      tx
    });

    const synonymContext = serviceEnv.DATASET_SYNONYM_ENABLED
      ? await getDatasetSynonymTransformContext({ teamId, datasetId })
      : undefined;
    const dataIds = await createPendingDatasetData(
      {
        scope: { teamId, tmbId, datasetId, collectionId },
        data: dataToIndex,
        indexStatus,
        synonymVersion: synonymContext?.version,
        indexSize
      },
      tx
    );
    return { insertLen: dataIds.length, dataIds };
  };

  return tx ? append(tx) : runInTransaction(append, { dialect: 'mongo' });
};

/** 追加 QA 原文，数据 ID 由 Worker 生成问答分块时创建。 */
export const appendDatasetQaTraining = async (
  {
    data,
    imageUploadKeys,
    agentModel,
    ...admission
  }: DocumentTrainingAdmission & {
    data: PushDataChunkType[];
    imageUploadKeys?: string[];
    agentModel: LLMModelDataType;
  },
  tx?: DbSession
): Promise<DatasetTrainingAppendResultType> => {
  const sourceChunks = filterTrainingDataList({ data, maxToken: getLLMMaxChunkSize(agentModel) });
  const { teamId, tmbId, datasetId, collectionId } = admission;

  const append = async (tx: DbSession): Promise<DatasetTrainingAppendResultType> => {
    await ensureDatasetCollectionTraining({ ...admission, hasWork: sourceChunks.length > 0 }, tx);
    if (sourceChunks.length === 0) return { insertLen: 0, dataIds: [] };

    await persistChunkImageReferences({
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(collectionId),
      data: sourceChunks,
      imageUploadKeys,
      tx
    });

    const insertLen = await createQaTrainingData(
      { scope: { teamId, tmbId, datasetId, collectionId }, sourceChunks },
      tx
    );
    return { insertLen, dataIds: [] };
  };

  return tx ? append(tx) : runInTransaction(append, { dialect: 'mongo' });
};

/** 数据集变更事务内批次标记待重建数据，仅为有实际分块的集合准备账单。 */
export const markDatasetDocumentRebuild = async (
  input: {
    teamId: string;
    tmbId: string;
    datasetId: string;
    vectorModelId: string;
  } & (
    | { indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending; synonymVersion?: never }
    | { indexStatus: DatasetDataIndexStageEnum.rebuildSynonymPending; synonymVersion: number }
  ),
  tx?: DbSession
): Promise<{ affectedDataCount: number; collectionIds: string[] }> => {
  if (!tx) {
    return runInTransaction((tx) => markDatasetDocumentRebuild(input, tx), { dialect: 'mongo' });
  }
  const { teamId, tmbId, datasetId, vectorModelId, ...rebuild } = input;
  const session = bridgeDbSessionToClientSession(tx);
  const scope = { teamId, datasetId };
  const match = {
    ...scope,
    ...rebuildableDatasetDataMatch,
    ...(rebuild.synonymVersion !== undefined && {
      synonymVersion: { $ne: rebuild.synonymVersion }
    })
  };
  const targets = await MongoDatasetData.aggregate<{ _id: Types.ObjectId }>([
    {
      $match: {
        ...match,
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId)
      }
    },
    { $group: { _id: '$collectionId' } }
  ]).session(session ?? null);
  const targetIds = targets.map(({ _id }) => _id);
  const collectionIds: string[] = [];
  let affectedDataCount = 0;
  const batchSize = 1000;

  for (let offset = 0; offset < targetIds.length; offset += batchSize) {
    const collections = await MongoDatasetCollection.find(
      { ...scope, _id: { $in: targetIds.slice(offset, offset + batchSize) } },
      { _id: 1, name: 1, training: 1 }
    )
      .session(session ?? null)
      .lean();
    if (collections.length === 0) continue;

    // 切换向量模型前已确认无待处理工作，强制开启新账单轮次，避免沿用尚未关账的旧模型明细。
    const startsNewRound = rebuild.indexStatus === DatasetDataIndexStageEnum.rebuildIndexPending;
    const newRounds = startsNewRound
      ? collections
      : collections.filter(({ training }) => !training);
    const usageIds = await createTrainingUsages(
      {
        teamId,
        tmbId,
        vectorModelId,
        bills: newRounds.map(({ _id, name }) => ({
          appName: name,
          trainingCollectionId: String(_id)
        }))
      },
      tx
    );
    const newUsageByCollection = new Map(
      newRounds.map(({ _id }, index) => [String(_id), usageIds[index]])
    );

    // 同义词重建复用文档账单，延用该向量模型的计费明细。
    for (const { training } of collections) {
      if (!startsNewRound && training) {
        await ensureTrainingUsageItems({ teamId, vectorModelId, usageId: training.usageId }, tx);
      }
    }

    await MongoDatasetCollection.bulkWrite(
      collections.map(({ _id, training }) => {
        const filter = { ...scope, _id };
        if (!startsNewRound && training) {
          return {
            updateOne: {
              filter,
              update:
                training.status === 'paused_unpaid'
                  ? {
                      $set: { 'training.status': 'active' as const },
                      $unset: {
                        'training.pausedAt': '',
                        'training.runId': '',
                        'training.runningItems': ''
                      },
                      $inc: { 'training.revision': 1 }
                    }
                  : { $inc: { 'training.revision': 1 } }
            }
          };
        }

        const usageId = newUsageByCollection.get(String(_id));
        if (!usageId) throw new Error('Document rebuild is missing its training usage');
        return {
          updateOne: {
            filter,
            update: {
              $set: {
                training: {
                  status: 'active' as const,
                  revision: (training?.revision ?? 0) + 1,
                  usageId
                }
              }
            }
          }
        };
      }),
      { session, ordered: true }
    );
    const batchIds = collections.map(({ _id }) => String(_id));
    const { modifiedCount } = await MongoDatasetData.updateMany(
      { ...match, collectionId: { $in: batchIds } },
      {
        $set: { indexStatus: rebuild.indexStatus },
        $unset: {
          indexError: '',
          indexErrorMsg: '',
          trainingIndexSize: '',
          synonymRebuildingVersion: ''
        }
      },
      { session }
    );
    affectedDataCount += modifiedCount;
    collectionIds.push(...batchIds);
  }

  return { affectedDataCount, collectionIds };
};

/** 切换向量模型并按文档创建重建工作，提交后投递。 */
export const switchDatasetEmbeddingModel = async ({
  teamId,
  tmbId,
  datasetId,
  vectorModelId,
  supportsImageEmbedding
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  vectorModelId: string;
  supportsImageEmbedding: boolean;
}) => {
  return runInTransaction(
    async (tx) => {
      const session = bridgeDbSessionToClientSession(tx);
      const datasetMatch = { _id: datasetId, teamId, deleteTime: null };
      const dataset = await MongoDataset.findOne(datasetMatch)
        .session(session ?? null)
        .lean();
      if (!dataset) throw DatasetErrEnum.unExist;
      if (String(dataset.vectorModelId || '') === vectorModelId) throw 'vectorModel 不合法';
      if (await hasBlockingDatasetTrainingTask({ teamId, datasetId }, tx)) {
        throw '数据集正在训练或者重建中，请稍后再试';
      }

      const imageIndex = supportsImageEmbedding || !!(dataset.vlmModelId || dataset.vlmModel);
      await MongoDataset.updateOne(
        datasetMatch,
        { $set: { vectorModelId, ...(!imageIndex && { 'chunkSettings.imageIndex': false }) } },
        { session }
      );
      if (!imageIndex) {
        await MongoDatasetCollection.updateMany(
          { teamId, datasetId },
          { $set: { imageIndex: false } },
          { session }
        );
      }
      const { collectionIds } = await markDatasetDocumentRebuild(
        {
          teamId,
          tmbId,
          datasetId,
          vectorModelId,
          indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
        },
        tx
      );
      tx.afterCommit(() => enqueueDatasetTrainingBatch({ teamId, collectionIds }));
      return getDatasetModelReference(dataset, 'embedding');
    },
    { dialect: 'mongo' }
  );
};
