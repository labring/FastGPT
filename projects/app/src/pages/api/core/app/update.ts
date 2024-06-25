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
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  removeInheritPermission,
  resumeInheritPermission
} from '@fastgpt/service/support/permission/inheritPermission';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

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

  let app: AppDetailType;
  if (defaultPermission && inheritPermission) {
    // if defaultPermission or inheritPermission is set, then need manage permission
    app = (await authApp({ req, authToken: true, appId, per: ManagePermissionVal })).app;
  } else {
    app = (await authApp({ req, authToken: true, appId, per: WritePermissionVal })).app;
  }

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });
  const isDefaultPermissionChanged =
    defaultPermission && defaultPermission !== app.defaultPermission;
  const isInheritPermissionChanged =
    defaultPermission && inheritPermission !== app.inheritPermission;

  if (isInheritPermissionChanged && isDefaultPermissionChanged) {
    // you can not resume inherit permission and change default permission at the same time
    Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  const updateCallback = async () => {
    await MongoApp.findByIdAndUpdate(appId, {
      ...parseParentIdInMongo(parentId),
      ...(name && { name }),
      ...(type && { type }),
      ...(avatar && { avatar }),
      ...(intro !== undefined && { intro }),
      ...(defaultPermission !== undefined && { defaultPermission }),
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
    // change the defaultPermission, remove the inheritPermission
    removeInheritPermission({
      resource: app,
      resourceFind: MongoApp.find,
      permissionType: PerResourceTypeEnum.app,
      resourceFindById: MongoApp.findById,
      resourceUpdateMany: MongoApp.updateMany,
      updatePermissionCallback: updateCallback
    });
    return;
  }

  if (isInheritPermissionChanged) {
    // the only possiblity is to resume the permission
    resumeInheritPermission({
      resourceUpdateMany: MongoApp.updateMany,
      resourceFindById: MongoApp.findById,
      resource: app,
      folderTypeList: [AppTypeEnum.folder, AppTypeEnum.httpPlugin],
      resourceFind: MongoApp.find,
      permissionType: PerResourceTypeEnum.app,
      resourceUpdateOne: MongoApp.updateOne
    });
    return;
  }

  return await updateCallback();
}

export default NextAPI(handler);
