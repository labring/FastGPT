import type { NextApiRequest } from 'next';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { AppRolePerMap } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppFolderPathQuerySchema,
  GetAppFolderPathResponseSchema
} from '@fastgpt/global/openapi/core/app/folder/api';
import { getAppFolderListScope, hasReadableAppFolderChild } from '@/service/core/app/visibleList';
import { getFolderParentPathItems } from '@fastgpt/service/common/parentFolder/ancestorIds';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { findResourceKeysByCollaboratorsPermission } from '@fastgpt/service/support/permission/resourcePermissionService';

async function handler(req: NextApiRequest): Promise<ParentTreePathItemType[]> {
  const { sourceId: appId, type = 'current' } = parseApiInput({
    req,
    querySchema: GetAppFolderPathQuerySchema
  }).query;
  if (!appId) return [];

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
    // 编辑页传入的是资源 ID；先校验资源读取权限，再根据它的 parentId 回溯目录路径。
    await authApp({ req, authToken: true, appId, per: ReadPermissionVal });
    const sourceApp = await MongoApp.findOne({ _id: appId, teamId, deleteTime: null })
      .select('parentId')
      .lean();
    const parentFolderId = sourceApp?.parentId ? String(sourceApp.parentId) : null;
    if (!parentFolderId) return GetAppFolderPathResponseSchema.parse([]);

    const parentFolder = await MongoApp.findOne({
      _id: parentFolderId,
      teamId,
      deleteTime: null,
      type: { $in: [AppTypeEnum.folder, AppTypeEnum.toolFolder] }
    })
      .select('type')
      .lean();
    if (!parentFolder) return GetAppFolderPathResponseSchema.parse([]);

    const parentPaths = await getFolderParentPathItems({
      folderId: parentFolderId,
      findFolder: (id) =>
        MongoApp.findOne({
          _id: id,
          teamId,
          deleteTime: null,
          type: parentFolder.type
        })
          .select('_id name parentId')
          .lean()
    });
    return GetAppFolderPathResponseSchema.parse(parentPaths);
  }

  const folderScope = await getAppFolderListScope({ teamId, currentFolderId: appId });
  const folder = folderScope.folders.find(({ _id }) => _id === appId);
  if (!folder) {
    await authApp({ req, authToken: true, appId, per: ReadPermissionVal });
    throw CommonErrEnum.invalidParams;
  }

  // 仅导航目录可以通过后代资源授权浏览；这里同时记录自身是否有真实读取权限，供 UI 隐藏写操作。
  let hasFolderReadPermission = teamPer.isOwner;
  if (!teamPer.isOwner) {
    const [groups, orgSet] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId })
    ]);
    const groupIds = groups.map(({ _id }) => String(_id));
    const orgIds = Array.from(orgSet).map(String);
    const readableResourceIds = await findResourceKeysByCollaboratorsPermission({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      tmbId,
      groupIds,
      orgIds,
      permission: ReadPermissionVal,
      matchLogic: 'or',
      personalPermissionPriority: true,
      rolePerMap: AppRolePerMap
    });
    hasFolderReadPermission = readableResourceIds.some((id) => String(id) === appId);
    if (
      !hasFolderReadPermission &&
      !(await hasReadableAppFolderChild({
        teamId,
        folderIds: folderScope.folderIds,
        readableResourceIds
      }))
    ) {
      await authApp({ req, authToken: true, appId, per: ReadPermissionVal });
    }
  }

  const paths = await getFolderParentPathItems({
    folderId: type === 'current' ? appId : folder.parentId ? String(folder.parentId) : null,
    findFolder: (id) =>
      MongoApp.findOne({ _id: id, teamId, deleteTime: null, type: folder.type })
        .select('_id name parentId')
        .lean()
  });
  return GetAppFolderPathResponseSchema.parse(
    paths.map((path) =>
      path.parentId === appId
        ? { ...path, folderAccessMode: hasFolderReadPermission ? 'read' : 'navigate' }
        : path
    )
  );
}

export default NextAPI(handler);
