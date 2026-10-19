import { deleteDatasetData } from '@/service/core/dataset/data/data';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteTrainingDataBodySchema,
  DeleteTrainingDataResponseSchema,
  type DeleteTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET);

/** 删除训练任务；重建任务同时删除原始数据及其索引，首次训练维持原有取消行为。 */
async function handler(req: ApiRequestProps): Promise<DeleteTrainingDataResponse> {
  const { collectionId, dataId } = parseApiInput({
    req,
    bodySchema: DeleteTrainingDataBodySchema
  }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ManagePermissionVal
  });

  const trainingMatch = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    _id: dataId
  };

  /** 训练记录清理是成员主动操作，审计失败不得影响删除主流程。 */
  const writeCleanAudit = (deletedCount: number) =>
    void addAuditLog({
      teamId,
      tmbId,
      event: AuditEventEnum.CLEAN_TRAINING_RECORD,
      params: {
        datasetId: String(collection.datasetId),
        datasetName: collection.dataset.name,
        collectionName: collection.name,
        count: String(deletedCount),
        result: deletedCount > 0 ? 'success' : 'skipped'
      }
    }).catch((error) => {
      logger.warn('Training record audit write failed', { error, teamId, collectionId, dataId });
    });

  let deletedCount = 0;
  await mongoSessionRun(async (session) => {
    const training = await MongoDatasetTraining.findOne(trainingMatch).session(session);
    if (!training) return;

    // 索引重建
    // 同义词重建
    if (
      [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(training.mode) &&
      training.dataId
    ) {
      // 关联数据必须属于已鉴权集合；读取和删除共用事务，避免工作线程完成提交后误用旧索引。
      const data = await MongoDatasetData.findOne({
        _id: training.dataId,
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionId: collection._id
      })
        .session(session)
        .lean();
      if (data) {
        await deleteDatasetData(
          {
            ...data,
            id: String(data._id)
          },
          session
        );
      }
      const result = await MongoDatasetTraining.deleteOne(trainingMatch, { session });
      deletedCount = result.deletedCount;
      return;
    }

    // 新建的
    if (training.dataId) {
      await MongoDatasetData.updateOne(
        {
          _id: training.dataId,
          teamId: collection.teamId,
          datasetId: collection.datasetId,
          collectionId: collection._id,
          indexStatus: DatasetDataIndexStatusEnum.indexing
        },
        {
          $set: {
            indexStatus: DatasetDataIndexStatusEnum.error,
            indexErrorMsg: 'Training task deleted'
          }
        },
        { session }
      );
    }

    const result = await MongoDatasetTraining.deleteOne(trainingMatch, { session });
    deletedCount = result.deletedCount;
  });
  writeCleanAudit(deletedCount);

  return DeleteTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);
export type deleteTrainingDataBody =
  import('@fastgpt/global/openapi/core/dataset/training/api').DeleteTrainingDataBody;
export type deleteTrainingDataResponse = DeleteTrainingDataResponse;
