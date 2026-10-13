import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type ClientSession } from 'mongoose';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateAppBodySchema,
  UpdateAppQuerySchema,
  type UpdateAppBodyType,
  type UpdateAppQueryType
} from '@fastgpt/global/openapi/core/app/common/api';
import { moveApp } from '@/service/core/app/move';

/**
 * 更新应用接口
 * 1. 若包含 parentId，则复用 moveApp 服务完成鉴权、层级检查、权限继承与移动操作；
 * 2. 若包含基础信息（名称、类型、头像、介绍等），则校验写权限并更新。
 */
async function handler(req: ApiRequestProps<UpdateAppBodyType, UpdateAppQueryType>): Promise<void> {
  const {
    query: { appId },
    body: { parentId, name, avatar, type, intro }
  } = parseApiInput({
    req,
    querySchema: UpdateAppQuerySchema,
    bodySchema: UpdateAppBodySchema
  });

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. 移动分支：直接调用 moveApp 统一服务
  if (parentId !== undefined) {
    await moveApp({ req, appId, parentId });
  }

  const hasOtherFields =
    name !== undefined || type !== undefined || avatar !== undefined || intro !== undefined;

  // 纯移动操作，无需执行后续属性更新
  if (!hasOtherFields) {
    return;
  }

  // 2. 基础属性更新
  const { app, permission, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  if (!permission.hasWritePer) {
    return Promise.reject(AppErrEnum.unAuthApp);
  }

  const onUpdate = async (session?: ClientSession) => {
    if (app.type === AppTypeEnum.mcpToolSet && avatar) {
      await MongoApp.updateMany({ parentId: appId, teamId: app.teamId }, { avatar }, { session });
    }

    await getS3AvatarSource().refreshAvatar(avatar, app.avatar, session);

    await MongoApp.findByIdAndUpdate(
      appId,
      {
        ...(name && { name }),
        ...(type && { type }),
        ...(avatar && { avatar }),
        ...(intro !== undefined && { intro }),
        updateTime: new Date()
      },
      { session }
    );

    updateParentFoldersUpdateTime({
      parentId: app.parentId
    });
  };

  logAppUpdate({ tmbId, teamId, app, name, intro: intro ?? undefined });

  await onUpdate();
}

export default NextAPI(handler);

const logAppUpdate = ({
  tmbId,
  teamId,
  app,
  name,
  intro
}: {
  tmbId: string;
  teamId: string;
  app: any;
  name?: string;
  intro?: string;
}) => {
  const getUpdateItems = () => {
    const names: string[] = [];
    const values: string[] = [];

    if (name !== undefined) {
      names.push(i18nT('common:name'));
      values.push(name);
    }

    if (intro !== undefined) {
      names.push(i18nT('common:Intro'));
      values.push(intro);
    }

    return {
      names,
      values
    };
  };

  const { names: newItemNames, values: newItemValues } = getUpdateItems();

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.UPDATE_APP_INFO,
    params: {
      appName: app.name,
      newItemNames: newItemNames,
      newItemValues: newItemValues,
      appType: getI18nAppType(app.type)
    }
  });
};
