import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppDetailType, AppSchema } from '@fastgpt/global/core/app/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  resumeInheritPermission,
  syncPermission
} from '@fastgpt/service/support/permission/inheritPermission';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: ApiRequestProps<AppUpdateParams, { appId: string }>) {
  const {
    parentId,
    name,
    avatar,
    type,
    intro,
    nodes,
    edges,
    chatConfig,
    teamTags,
    defaultPermission,
    inheritPermission
  } = req.body as AppUpdateParams;

  const { appId } = req.query as { appId: string };

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  const isMove = parentId !== undefined;
  const isMoveToRoot = isMove && parentId === null;

  let parentFolder: AppSchema;
  if (isMove) {
    // if move, auth the parent folder
    if (isMoveToRoot) {
      // if move to root, then no need to auth the parent folder. Auth the user instead
      await authUserPer({ req, authToken: true, per: ManagePermissionVal });
    } else {
      parentFolder = (
        await authApp({
          req,
          authToken: true,
          appId: parentId,
          per: ManagePermissionVal
        })
      ).app;
    }
  }

  let app: AppDetailType;
  if (defaultPermission || inheritPermission) {
    // if defaultPermission or inheritPermission is set, then need manage permission
    app = (await authApp({ req, authToken: true, appId, per: ManagePermissionVal })).app;
  } else {
    app = (await authApp({ req, authToken: true, appId, per: WritePermissionVal })).app;
  }

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });
  const isDefaultPermissionChanged =
    defaultPermission !== undefined && defaultPermission !== app.defaultPermission;
  const isInheritPermissionChanged =
    inheritPermission !== undefined && inheritPermission !== app.inheritPermission;

  const isMoveFromRoot = isMove && app.parentId === null;

  if (isInheritPermissionChanged && isDefaultPermissionChanged) {
    // you can not resume inherit permission and change default permission at the same time
    Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  const onUpdate = async () => {
    return await MongoApp.findByIdAndUpdate(appId, {
      ...parseParentIdInMongo(parentId),
      ...(name && { name }),
      ...(type && { type }),
      ...(avatar && { avatar }),
      ...(intro !== undefined && { intro }),
      ...(defaultPermission !== undefined && { defaultPermission }),
      ...((isDefaultPermissionChanged || isMoveToRoot) && { inheritPermission: false }),
      ...(isMoveFromRoot && { inheritPermission: true }),
      ...(inheritPermission !== undefined && { inheritPermission }),
      ...(teamTags && { teamTags }),
      ...(formatNodes && {
        modules: formatNodes
      }),
      ...(edges && {
        edges
      }),
      ...(chatConfig && { chatConfig })
    });
  };

  if (isDefaultPermissionChanged) {
    onUpdate();
    parentFolder = await MongoApp.findById(parentId).lean();
    syncPermission({
      resource: {
        ...app,
        defaultPermission
      },
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp,
      folderTypeList: [AppTypeEnum.folder, AppTypeEnum.httpPlugin],
      parentResource: parentFolder
    });
    return;
  }

  if (isInheritPermissionChanged) {
    // the only possiblity is to resume the permission
    resumeInheritPermission({
      resource: app,
      folderTypeList: [AppTypeEnum.folder, AppTypeEnum.httpPlugin],
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp
    });
    return;
  }

  if (isMove) {
    syncPermission({
      resource: {
        ...app,
        parentId,
        inheritPermission: isMoveToRoot ? false : isMoveFromRoot ? true : app.inheritPermission
      },
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp,
      folderTypeList: [AppTypeEnum.folder, AppTypeEnum.httpPlugin],
      parentResource: isMoveToRoot ? undefined : parentFolder!
    });
  }

  // otherwise
  return await onUpdate();
}

export default NextAPI(handler);
