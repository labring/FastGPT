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
import { isDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET);

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

  /** 清理训练记录是成员主动发起的管理动作，删除成功后记一条事件，旁路失败不影响接口。 */
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

  if (!isDatasetSynonymEnabled()) {
    const { deletedCount } = await MongoDatasetTraining.deleteOne(trainingMatch);
    writeCleanAudit(deletedCount);
    return DeleteTrainingDataResponseSchema.parse(undefined);
  }

  let deletedCount = 0;
  await mongoSessionRun(async (session) => {
    const training = await MongoDatasetTraining.findOne(trainingMatch).session(session);
    if (training?.dataId && training.synonymVersion) {
      await MongoDatasetData.updateOne(
        {
          _id: training.dataId,
          synonymRebuildingVersion: training.synonymVersion
        },
        { $unset: { synonymRebuildingVersion: '' } },
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
