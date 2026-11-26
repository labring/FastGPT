import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
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
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildCollectionAuditResource } from '@fastgpt/global/support/user/audit/type';
import { cancelDocumentTrainingTask } from '@/service/core/dataset/training/documentActions';

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

  const scope = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id
  };
  const deleted = await mongoSessionRun((session) =>
    cancelDocumentTrainingTask({ scope, taskId: dataId }, session)
  );

  // 没有实际删除记录时不写审计，避免重复点击产生空日志。
  if (deleted) {
    addAuditLog({
      tmbId,
      teamId: String(teamId),
      event: DatasetAuditEventEnum.DATASET_TRAINING_RECORD_DELETE,
      resources: [buildCollectionAuditResource(collection)],
      params: {
        datasetName: collection.dataset.name,
        collectionName: collection.name
      }
    });
  }

  return DeleteTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);
export type deleteTrainingDataBody =
  import('@fastgpt/global/openapi/core/dataset/training/api').DeleteTrainingDataBody;
export type deleteTrainingDataResponse = DeleteTrainingDataResponse;
