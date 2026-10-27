import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetDatasetPathsQuerySchema,
  GetDatasetPathsResponseSchema,
  type GetDatasetPathsResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getDatasetFolderListScope,
  hasReadableDatasetFolderChild
} from '@/service/core/dataset/visibleList';
import { getFolderParentPathItems } from '@fastgpt/service/common/parentFolder/ancestorIds';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { findResourceKeysByCollaboratorsPermission } from '@fastgpt/service/support/permission/resourcePermissionService';

async function handler(req: ApiRequestProps): Promise<GetDatasetPathsResponse> {
  const { sourceId: datasetId, type } = parseApiInput({
    req,
    querySchema: GetDatasetPathsQuerySchema
  }).query;
  if (!datasetId) return [];

  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  if (type === 'parent') {
    // 详情页传入的是 Dataset ID；确认资源可读后，沿它的 parentId 返回目录路径。
    await authDataset({ req, authToken: true, datasetId, per: ReadPermissionVal });
    const sourceDataset = await MongoDataset.findOne({ _id: datasetId, teamId, deleteTime: null })
      .select('parentId')
      .lean();
    const parentFolderId = sourceDataset?.parentId ? String(sourceDataset.parentId) : null;
    if (!parentFolderId) return GetDatasetPathsResponseSchema.parse([]);

    const parentFolder = await MongoDataset.findOne({
      _id: parentFolderId,
      teamId,
      deleteTime: null,
      type: DatasetTypeEnum.folder
    })
      .select('_id')
      .lean();
    if (!parentFolder) return GetDatasetPathsResponseSchema.parse([]);

    const parentPaths = await getFolderParentPathItems({
      folderId: parentFolderId,
      findFolder: (id) =>
        MongoDataset.findOne({
          _id: id,
          teamId,
          deleteTime: null,
          type: DatasetTypeEnum.folder
        })
          .select('_id name parentId')
          .lean()
    });
    return GetDatasetPathsResponseSchema.parse(parentPaths);
  }

  const folderScope = await getDatasetFolderListScope({ teamId, currentFolderId: datasetId });
  const folder = folderScope.folders.find(({ _id }) => _id === datasetId);
  if (!folder) {
    await authDataset({ req, authToken: true, datasetId, per: ReadPermissionVal });
    throw CommonErrEnum.invalidParams;
  }

  // 仅导航目录可以通过后代资源授权浏览；同时返回当前目录是否具备真实读取权限。
  let hasFolderReadPermission = teamPer.isOwner;
  if (!teamPer.isOwner) {
    const [groups, orgSet] = await Promise.all([
      getGroupsByTmbId({ teamId, tmbId }),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId })
    ]);
    const groupIds = groups.map(({ _id }) => String(_id));
    const orgIds = Array.from(orgSet).map(String);
    const readableResourceIds = await findResourceKeysByCollaboratorsPermission({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      tmbId,
      groupIds,
      orgIds,
      permission: ReadPermissionVal,
      matchLogic: 'or',
      personalPermissionPriority: true
    });
    hasFolderReadPermission = readableResourceIds.some((id) => String(id) === datasetId);
    if (
      !hasFolderReadPermission &&
      !(await hasReadableDatasetFolderChild({
        teamId,
        folderIds: folderScope.folderIds,
        readableResourceIds
      }))
    ) {
      await authDataset({ req, authToken: true, datasetId, per: ReadPermissionVal });
    }
  }

  const paths = await getFolderParentPathItems({
    folderId: type === 'current' ? datasetId : folder.parentId ? String(folder.parentId) : null,
    findFolder: (id) =>
      MongoDataset.findOne({
        _id: id,
        teamId,
        deleteTime: null,
        type: DatasetTypeEnum.folder
      })
        .select('_id name parentId')
        .lean()
  });
  return GetDatasetPathsResponseSchema.parse(
    paths.map((path) =>
      path.parentId === datasetId
        ? { ...path, folderAccessMode: hasFolderReadPermission ? 'read' : 'navigate' }
        : path
    )
  );
}

export default NextAPI(handler);
