import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { Types } from '@fastgpt/service/common/mongo';
import {
  canShortCircuitCollectionPermission,
  getCollectionPermissionMap,
  getReadableCollectionIds
} from '@fastgpt/service/support/permission/collection/auth';
import type { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { findDatasetCollectionsForVisibility } from '../collectionVisibleList';

/** 从已鉴权的知识库取得异常查询范围，集合权限启用时显式限定可读文档。 */
export const getDatasetTrainingErrorReadScope = async ({
  teamId,
  tmbId,
  isRoot,
  dataset
}: Awaited<ReturnType<typeof authDataset>>) => {
  const datasetId = String(dataset._id);
  const scope = { teamId: new Types.ObjectId(teamId), datasetId: new Types.ObjectId(datasetId) };
  if (
    isRoot ||
    dataset.collectionPermissionEnabled !== true ||
    (await canShortCircuitCollectionPermission({ teamId, tmbId, datasetIds: [datasetId] }))
  ) {
    return scope;
  }

  const [collections, groups, orgIds] = await Promise.all([
    findDatasetCollectionsForVisibility({ teamId, datasetId }),
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
  ]);
  const readableIds = await getReadableCollectionIds({
    collections: collections.filter(({ type }) => type !== DatasetCollectionTypeEnum.folder),
    teamId,
    tmbId,
    groupIds: groups.map(({ _id }) => String(_id)),
    orgIds: Array.from(orgIds),
    datasetPermission: dataset.permission.role,
    collectionPermissionEnabled: true
  });
  return { ...scope, collectionIds: readableIds.map((id) => new Types.ObjectId(id)) };
};

/** 从已鉴权的知识库取得批量重试范围，集合权限启用时显式限定可写文档。 */
export const getDatasetTrainingWriteScope = async ({
  teamId,
  tmbId,
  isRoot,
  dataset
}: Awaited<ReturnType<typeof authDataset>>): Promise<{
  teamId: string;
  datasetId: string;
  collectionIds?: string[];
}> => {
  const datasetId = String(dataset._id);
  const scope = { teamId: String(teamId), datasetId };
  if (
    isRoot ||
    dataset.collectionPermissionEnabled !== true ||
    (await canShortCircuitCollectionPermission({ teamId, tmbId, datasetIds: [datasetId] }))
  ) {
    return scope;
  }

  const [collections, groups, orgIds] = await Promise.all([
    findDatasetCollectionsForVisibility({ teamId, datasetId }),
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
  ]);
  const documents = collections.filter(({ type }) => type !== DatasetCollectionTypeEnum.folder);
  const permissionMap = await getCollectionPermissionMap({
    collections: documents,
    teamId,
    tmbId,
    groupIds: groups.map(({ _id }) => String(_id)),
    orgIds: Array.from(orgIds)
  });
  const writableIds = documents
    .filter(({ _id }) => {
      const role = permissionMap.get(String(_id));
      return (
        role !== undefined && new Permission({ role, isOwner: false }).checkPer(WritePermissionVal)
      );
    })
    .map(({ _id }) => String(_id));
  return { ...scope, collectionIds: writableIds };
};
