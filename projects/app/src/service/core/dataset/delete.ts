import type { ApiRequestProps } from '@fastgpt/next/type';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { deleteDatasetsImmediate } from '@fastgpt/service/core/dataset/delete/processor';
import { addDatasetDeleteJob } from '@fastgpt/service/core/dataset/delete';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/**
 * 删除单个知识库或文件夹及其子树，同步即时清理，投递异步清理队列，并记录审计日志。
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

  await deleteDatasetsImmediate({ teamId, datasetIds });
  await mongoSessionRun(async (session) => {
    await MongoDataset.updateMany(
      { _id: { $in: datasetIds }, teamId },
      { deleteTime: new Date() },
      { session }
    );
    await addDatasetDeleteJob({ teamId, datasetId: id });
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.DELETE_DATASET,
    params: {
      datasetName: dataset.name,
      datasetType: getI18nDatasetType(dataset.type)
    }
  });

  return datasetIds.map(String);
};
