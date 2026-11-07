import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';

/** 单条和批量鉴权共用知识库团队归属、owner 及权限门槛，不在此处读取身份或 ACL。 */
export const assertDatasetPermission = ({
  dataset,
  teamId,
  tmbId,
  isTeamOwner,
  isRoot,
  role,
  per
}: {
  dataset: DatasetSchemaType;
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
  isRoot: boolean;
  role: PermissionValueType;
  per: PermissionValueType;
}) => {
  if (!isRoot && String(dataset.teamId) !== teamId) throw DatasetErrEnum.unAuthDataset;
  const permission = new DatasetPermission({
    role,
    isOwner: isRoot || isTeamOwner || String(dataset.tmbId) === tmbId
  });
  if (!permission.checkPer(per)) throw DatasetErrEnum.unAuthDataset;
  return { ...dataset, permission };
};
