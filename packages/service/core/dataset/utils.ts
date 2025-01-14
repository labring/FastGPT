import { getTmbInfoByTmbId } from '../../support/user/team/controller';
import { getResourcePermission } from '../../support/permission/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

// TODO: 需要优化成批量获取权限
export const filterDatasetsByTmbId = async ({
  datasetIds,
  tmbId
}: {
  datasetIds: string[];
  tmbId: string;
}) => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  // First get all permissions
  const permissions = await Promise.all(
    datasetIds.map(async (datasetId) => {
      const per = await getResourcePermission({
        teamId,
        tmbId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset
      });

      if (per === undefined) return false;

      const datasetPer = new DatasetPermission({
        per,
        isOwner: tmbPer.isOwner
      });

      return datasetPer.hasReadPer;
    })
  );

  // Then filter datasetIds based on permissions
  return datasetIds.filter((_, index) => permissions[index]);
};
