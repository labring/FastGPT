import type { ApiRequestProps } from '@fastgpt/next/type';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import {
  markDatasetsForDeletion,
  removeDatasetSyncSchedulers
} from '@fastgpt/service/core/dataset/delete/processor';
import { addDatasetDeleteJob } from '@fastgpt/service/core/dataset/delete';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { buildDatasetAuditResource } from '@fastgpt/global/support/user/audit/type';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/**
 * 删除知识库或文件夹子树：移除同步调度、标记删除、投递清理任务并记录审计日志。
 * 返回被删除的知识库与文件夹 ID 列表。
 */
export const deleteDataset = async ({
  req,
  id
}: {
  req: ApiRequestProps;
  id: string;
}): Promise<string[]> => {
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: id,
    per: OwnerPermissionVal
  });
  const datasets = await findDatasetAndAllChildren({
    teamId,
    datasetId: id,
    fields: '_id'
  });
  const datasetIds = datasets.map((item) => item._id);

  await removeDatasetSyncSchedulers(datasetIds);
  await mongoSessionRun(async (session) => {
    await markDatasetsForDeletion({ teamId, datasetIds }, session);
    await addDatasetDeleteJob({ teamId, datasetId: id });
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.DELETE_DATASET,
    resources: [
      buildDatasetAuditResource(
        { _id: id, name: dataset.name, avatar: dataset.avatar, type: dataset.type },
        { deleted: true }
      )
    ],
    params: {
      datasetName: dataset.name,
      datasetType: getI18nDatasetType(dataset.type)
    }
  });

  return datasetIds.map(String);
};
