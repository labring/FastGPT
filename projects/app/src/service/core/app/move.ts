import type { ApiRequestProps } from '@fastgpt/next/type';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { shouldInheritResourcePermission } from '@fastgpt/service/support/permission/resourcePermissionPolicy';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import {
  getFolderAncestorIdsFromParentId,
  rewriteFolderSubtreeAncestorIds
} from '@fastgpt/service/common/parentFolder/ancestorIds';
import { serviceEnv } from '@fastgpt/service/env';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import { getAppFolderTree, validateParentFolderType } from '@fastgpt/service/core/app/folderTree';

const logAppMove = ({
  tmbId,
  teamId,
  app,
  targetName
}: {
  tmbId: string;
  teamId: string;
  app: any;
  targetName: string;
}) => {
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.MOVE_APP,
    params: {
      appName: app.name,
      targetFolderName: targetName,
      appType: getI18nAppType(app.type)
    }
  });
};

/** 移动单个应用或文件夹，处理深度、权限继承与更新时间更新。 */
export const moveApp = async ({
  req,
  appId,
  parentId: rawParentId
}: {
  req: ApiRequestProps;
  appId: string;
  parentId: ParentIdType;
}) => {
  const parentId = rawParentId || null;
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  let targetName = 'root';
  if (parentId) {
    const { app: targetApp } = await authApp({
      req,
      authToken: true,
      appId: parentId,
      per: ManagePermissionVal
    });
    targetName = targetApp.name;
  }

  if (app.parentId) {
    await authApp({ req, authToken: true, appId: app.parentId, per: ManagePermissionVal });
  }
  if (parentId === null || !app.parentId) {
    await authUserPer({
      req,
      authToken: true,
      per: TeamAppCreatePermissionVal
    });
  }

  // 普通应用与工具分属两棵目录树，移动目标必须是同一棵树内的文件夹。
  await validateParentFolderType({ parentId, childType: app.type });

  const folderTree = getAppFolderTree(app.type);
  const isFolderType = (type: string) =>
    AppFolderTypeList.includes(type as AppTypeEnum) &&
    (!folderTree || getAppFolderTree(type) === folderTree);

  await checkMoveFolderDepth({
    resourceId: appId,
    targetParentId: parentId,
    findResource: (id) =>
      MongoApp.findOne({ _id: id, teamId: app.teamId }, '_id parentId type').lean(),
    findChildren: (parentId) => MongoApp.find({ parentId, teamId: app.teamId }, '_id type').lean(),
    isFolderType
  });

  await mongoSessionRun(async (session) => {
    const isPathFolder = app.type === AppTypeEnum.folder || app.type === AppTypeEnum.toolFolder;
    const ancestorIds = isPathFolder
      ? await getFolderAncestorIdsFromParentId({
          parentId: parentId ? String(parentId) : null,
          maxDepth: serviceEnv.MAX_FOLDER_DEPTH,
          findFolder: (id) =>
            MongoApp.findOne({ _id: id, teamId: app.teamId, type: app.type })
              .select('_id parentId')
              .session(session)
              .lean()
        })
      : undefined;
    const rewriteDescendantPaths = async () => {
      if (!isPathFolder || !ancestorIds) return;
      await rewriteFolderSubtreeAncestorIds({
        rootId: appId,
        rootAncestorIds: ancestorIds,
        // 路径重写也按目标祖先加子树的绝对层级校验，不能沿用只读遍历上限。
        maxDepth: serviceEnv.MAX_FOLDER_DEPTH,
        findChildFolders: (parentIds) =>
          MongoApp.find({ teamId: app.teamId, parentId: { $in: parentIds }, type: app.type })
            .select('_id parentId')
            .session(session)
            .lean(),
        writeAncestorIds: (updates) =>
          MongoApp.bulkWrite(
            updates.map(({ id, ancestorIds: childAncestorIds }) => ({
              updateOne: {
                filter: { _id: id, teamId: app.teamId, type: app.type },
                update: { $set: { ancestorIds: childAncestorIds } }
              }
            })),
            { session }
          ).then(() => undefined)
      });
    };

    // 路径和 parentId 在同一事务写入；权限非继承分支也必须更新后代路径。
    if (!shouldInheritResourcePermission(app.inheritPermission)) {
      await MongoApp.updateOne(
        { _id: appId },
        {
          ...parseParentIdInMongo(parentId),
          ...(ancestorIds ? { ancestorIds } : {}),
          updateTime: new Date()
        },
        { session }
      );
      await rewriteDescendantPaths();
      return;
    }

    // 继承态，需要改内容，同时更新协作者
    const [parentClbs, oldParentClbs, oldResourceClbs] = await Promise.all([
      getResourceOwnedClbs({
        teamId: app.teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.app,
        session
      }),
      app.parentId
        ? getResourceOwnedClbs({
            teamId: app.teamId,
            resourceId: app.parentId,
            resourceType: PerResourceTypeEnum.app,
            session
          })
        : Promise.resolve([]),
      getResourceOwnedClbs({
        teamId: app.teamId,
        resourceId: app._id,
        resourceType: PerResourceTypeEnum.app,
        session
      })
    ]);

    const newResourceClbs = await syncCollaborators({
      resourceId: app._id,
      resourceType: PerResourceTypeEnum.app,
      collaborators: parentClbs,
      oldParentCollaborators: oldParentClbs,
      session,
      teamId: app.teamId
    });

    await syncChildrenPermission({
      resource: app,
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp,
      folderTypeList: AppFolderTypeList,
      oldParentCollaborators: oldResourceClbs,
      newParentCollaborators: newResourceClbs,
      session
    });

    await MongoApp.updateOne(
      { _id: appId },
      {
        ...parseParentIdInMongo(parentId),
        ...(ancestorIds ? { ancestorIds } : {}),
        inheritPermission: true,
        updateTime: new Date()
      },
      { session }
    );
    await rewriteDescendantPaths();
  });

  updateParentFoldersUpdateTime({ parentId: app.parentId });
  updateParentFoldersUpdateTime({ parentId });

  logAppMove({ tmbId, teamId, app, targetName });
};
