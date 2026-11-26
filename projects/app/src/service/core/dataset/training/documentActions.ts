import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum
} from '@fastgpt/global/core/dataset/data/constants';
import {
  datasetDataDocumentTrainingStatusByMode,
  datasetDataDocumentTrainingStatuses,
  datasetDataDocumentWorkStatuses,
  datasetDataRebuildFailedStatuses,
  isDatasetDataDocumentTrainingStatus,
  isDatasetDataModelRebuild,
  isDatasetDataSynonymRebuild
} from '@fastgpt/global/core/dataset/data/utils';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import {
  bridgeClientSessionToDbSession,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import { persistChunkImageReferences } from '@fastgpt/service/core/dataset/data/inlineImages/entity';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetQaTraining } from '@fastgpt/service/core/dataset/training/qaSchema';
import { documentIndexTrainingModes } from '@fastgpt/service/core/dataset/data/query';
import {
  enqueueDatasetTrainingBatch,
  resumeUnpaidDatasetTraining,
  settleDatasetTrainingRoundAfterWrite
} from '@fastgpt/service/core/dataset/training/runtime';
import { deleteDatasetData } from '@/service/core/dataset/data/data';

type TrainingScope = { teamId: string; datasetId: string; collectionId: string };

/** 通过公开的任务 ID 查询文档队列工作项。已完成的索引属于普通数据。 */
export const findDocumentTrainingTask = async (id: string, scope?: TrainingScope) => {
  const match = { ...scope, _id: id };
  const [data, qa, parse] = await Promise.all([
    MongoDatasetData.findOne({
      ...match,
      indexStatus: {
        $in: [...datasetDataDocumentWorkStatuses, ...datasetDataRebuildFailedStatuses]
      }
    }).lean(),
    MongoDatasetQaTraining.findOne(match).lean(),
    !scope || scope.collectionId.toLowerCase() === id.toLowerCase()
      ? MongoDatasetCollection.findOne({
          _id: id,
          ...(scope && { teamId: scope.teamId, datasetId: scope.datasetId }),
          'training.parse': { $exists: true }
        }).lean()
      : undefined
  ]);
  if (data?.indexStatus) {
    if (
      isDatasetDataModelRebuild(data.indexStatus) ||
      data.indexStatus === DatasetDataIndexStatusEnum.rebuildIndexFailed
    ) {
      return { ...data, mode: TrainingModeEnum.rebuildIndex as const };
    }
    if (
      isDatasetDataSynonymRebuild(data.indexStatus) ||
      data.indexStatus === DatasetDataIndexStatusEnum.rebuildSynonymFailed
    ) {
      return { ...data, mode: TrainingModeEnum.rebuildSynonym as const };
    }
    const mode = documentIndexTrainingModes.find(
      (mode) => datasetDataDocumentTrainingStatusByMode[mode] === data.indexStatus
    );
    if (mode) return { ...data, mode };
  }
  if (qa) return { ...qa, mode: TrainingModeEnum.qa as const, a: undefined, imageId: undefined };
  if (parse) {
    return {
      _id: parse._id,
      collectionId: parse._id,
      teamId: parse.teamId,
      datasetId: parse.datasetId,
      mode: TrainingModeEnum.parse as const,
      q: undefined,
      a: undefined,
      imageId: undefined
    };
  }
};

type RetryDocumentTrainingWork = {
  scope: TrainingScope;
  taskId?: string;
  edit?: { q?: string; a?: string; chunkIndex?: number };
  imageUploadKeys?: string[];
};

/** 重试沿用当前文档账单；集合版本写入防止和最后一个任务的收尾交错。 */
const retryDocumentTrainingItems = async ({
  scope,
  taskId,
  edit,
  imageUploadKeys
}: RetryDocumentTrainingWork) => {
  const { collectionId, teamId, datasetId } = scope;
  return mongoSessionRun(async (session) => {
    const collection = await MongoDatasetCollection.findOneAndUpdate(
      { _id: collectionId, teamId, datasetId, training: { $exists: true } },
      { $inc: { 'training.revision': 1 } },
      { session }
    ).lean();
    if (!collection?.training) return false;

    const retryParse =
      (!taskId || taskId.toLowerCase() === collectionId.toLowerCase()) &&
      collection.training.parse?.status === 'error';
    if (retryParse) {
      await MongoDatasetCollection.updateOne(
        { _id: collectionId, teamId, datasetId },
        {
          $set: { 'training.parse.status': 'active' },
          $unset: { 'training.parse.errorMsg': '' }
        },
        { session }
      );
    }

    const match = { ...scope, ...(taskId && { _id: taskId }) };
    const editFields = taskId && edit && Object.keys(edit).length > 0 ? edit : undefined;
    // 欠费时异常列表也包含尚未执行的分块和 QA；以事务内的暂停状态决定是否接受编辑。
    const editingWhilePaused = !!editFields && collection.training.status === 'paused_unpaid';
    const indexMatch = { ...match, ...(!editingWhilePaused && { indexError: true }) };
    if (
      editFields &&
      (editFields.q !== undefined || editFields.a !== undefined || imageUploadKeys?.length)
    ) {
      const [currentData, currentQa] = await Promise.all([
        MongoDatasetData.findOne({
          ...indexMatch,
          indexStatus: { $in: datasetDataDocumentTrainingStatuses }
        })
          .session(session)
          .lean(),
        MongoDatasetQaTraining.findOne({ ...match, ...(!editingWhilePaused && { status: 'error' }) })
          .session(session)
          .lean()
      ]);
      const current = currentData ?? currentQa;
      if (current) {
        await persistChunkImageReferences({
          teamId: String(teamId),
          datasetId: String(datasetId),
          collectionId: String(collectionId),
          data: [{ ...current, ...editFields }],
          imageUploadKeys,
          tx: bridgeClientSessionToDbSession(session)
        });
      }
    }
    const suppliedImageText = editFields?.q
      ? await MongoDatasetData.updateOne(
          { ...indexMatch, indexStatus: DatasetDataIndexStageEnum.imageParse },
          {
            $set: {
              ...editFields,
              indexStatus: collection.autoIndexes
                ? DatasetDataIndexStageEnum.auto
                : DatasetDataIndexStageEnum.index
            },
            $unset: { indexError: '', indexErrorMsg: '' }
          },
          { session }
        )
      : undefined;
    const data = await (async () => {
      // 补充图片正文时已保存编辑字段并推进阶段，直接沿用这次写入结果。
      if (suppliedImageText?.modifiedCount) return suppliedImageText;

      if (editFields) {
        return MongoDatasetData.updateMany(
          { ...indexMatch, indexStatus: { $in: datasetDataDocumentTrainingStatuses } },
          { $set: editFields, $unset: { indexError: '', indexErrorMsg: '' } },
          { session }
        );
      }

      return MongoDatasetData.updateMany(
        {
          ...match,
          $or: [
            { indexStatus: { $in: datasetDataDocumentWorkStatuses }, indexError: true },
            { indexStatus: { $in: datasetDataRebuildFailedStatuses } }
          ]
        },
        [
          {
            $set: {
              indexStatus: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildIndexFailed]
                      },
                      then: DatasetDataIndexStageEnum.rebuildIndexPending
                    },
                    {
                      case: {
                        $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildSynonymFailed]
                      },
                      then: DatasetDataIndexStageEnum.rebuildSynonymPending
                    }
                  ],
                  default: '$indexStatus'
                }
              },
              indexError: '$$REMOVE',
              indexErrorMsg: '$$REMOVE'
            }
          }
        ],
        { session }
      );
    })();
    const qa = await MongoDatasetQaTraining.updateMany(
      { ...match, ...(!editingWhilePaused && { status: 'error' }) },
      {
        $set: {
          status: 'active',
          ...(editFields?.q !== undefined && { q: editFields.q }),
          ...(editFields?.chunkIndex !== undefined && { chunkIndex: editFields.chunkIndex })
        },
        $unset: { errorMsg: '' }
      },
      { session }
    );
    return retryParse || data.modifiedCount > 0 || qa.matchedCount > 0;
  });
};

export const retryDocumentTrainingWork = async (input: RetryDocumentTrainingWork) => {
  const { teamId, collectionId } = input.scope;
  const hasEdit = Boolean(input.taskId && input.edit && Object.keys(input.edit).length > 0);
  if (hasEdit) {
    // 欠费态允许保存单条编辑内容，余额正常时再补投队列。
    const modified = await retryDocumentTrainingItems(input);
    const balance = await resumeUnpaidDatasetTraining(input.scope);
    if (modified && balance !== 'unpaid') {
      await enqueueDatasetTrainingBatch({ teamId, collectionIds: [collectionId] });
    }
    return;
  }

  // 非编辑重试先确认余额，团队仍欠费时保留原业务报错不被清空。
  if ((await resumeUnpaidDatasetTraining(input.scope)) === 'unpaid') return;
  if (await retryDocumentTrainingItems(input)) {
    await enqueueDatasetTrainingBatch({ teamId, collectionIds: [collectionId] });
  }
};

/** 知识库批量重试按文档执行，避免把不同轮次和账单合并到同一个事务。 */
export const retryDatasetDocumentTrainingWork = async ({
  teamId,
  datasetId,
  collectionIds
}: Omit<TrainingScope, 'collectionId'> & { collectionIds?: string[] }) => {
  if (collectionIds !== undefined && collectionIds.length === 0) return;
  if ((await resumeUnpaidDatasetTraining({ teamId, datasetId, collectionIds })) === 'unpaid') {
    return;
  }

  const collections = MongoDatasetCollection.find(
    {
      teamId,
      datasetId,
      ...(collectionIds !== undefined && { _id: { $in: collectionIds } }),
      training: { $exists: true }
    },
    { _id: 1 }
  )
    .lean()
    .cursor();
  const enqueueIds: string[] = [];
  for await (const { _id } of collections) {
    const collectionId = String(_id);
    if (await retryDocumentTrainingItems({ scope: { teamId, datasetId, collectionId } })) {
      enqueueIds.push(collectionId);
    }
  }
  await enqueueDatasetTrainingBatch({ teamId, collectionIds: enqueueIds });
};

/** 取消一项文档工作并使正在执行的切片失去提交权，首次索引取消时仍保留分块。 */
export const cancelDocumentTrainingTask = async (
  { scope, taskId }: { scope: TrainingScope; taskId: string },
  session: ClientSession
): Promise<boolean> => {
  const { teamId, datasetId, collectionId } = scope;
  const task = { ...scope, _id: taskId };
  const cancelParse = taskId.toLowerCase() === collectionId.toLowerCase();
  const index = {
    ...task,
    indexStatus: { $in: [...datasetDataDocumentWorkStatuses, ...datasetDataRebuildFailedStatuses] }
  };
  const cancelIndex = cancelParse
    ? null
    : await MongoDatasetData.findOne(index).session(session).lean();
  const cancelledIndexErrorMsg = 'Training task deleted';
  const isInitialIndex = isDatasetDataDocumentTrainingStatus(cancelIndex?.indexStatus);

  if (
    !cancelParse &&
    !cancelIndex &&
    !(await MongoDatasetQaTraining.exists(task).read('primary').session(session))
  ) {
    return false;
  }

  const updated = await MongoDatasetCollection.updateOne(
    {
      _id: collectionId,
      teamId,
      datasetId,
      training: { $exists: true },
      ...(cancelParse && { 'training.parse': { $exists: true } })
    },
    {
      $inc: { 'training.revision': 1 },
      $unset: {
        'training.runId': '',
        ...(cancelParse && { 'training.parse': '' })
      }
    },
    { session }
  );
  if (!updated.matchedCount) return false;
  if (cancelParse) {
    await settleDatasetTrainingRoundAfterWrite(scope, session);
    return true;
  }

  if (cancelIndex) {
    if (isInitialIndex) {
      // 首次索引取消后退出工作阶段并保留分块，避免在错误列表重现或被批量重试复活。
      await MongoDatasetData.updateOne(
        index,
        {
          $set: {
            indexStatus: DatasetDataIndexStatusEnum.error,
            indexErrorMsg: cancelledIndexErrorMsg
          },
          $unset: { indexError: '' }
        },
        { session }
      );
    } else {
      await deleteDatasetData({ ...cancelIndex, id: String(cancelIndex._id) }, session);
    }
    await settleDatasetTrainingRoundAfterWrite(scope, session);
  } else {
    await MongoDatasetQaTraining.deleteOne(task, { session });
    await settleDatasetTrainingRoundAfterWrite(scope, session);
  }
  return true;
};
