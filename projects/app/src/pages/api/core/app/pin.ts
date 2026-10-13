import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { updateAppPin } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  PinAppBodySchema,
  PinAppQuerySchema,
  PinAppResponseSchema,
  type PinAppBodyType,
  type PinAppQueryType,
  type PinAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

// 置顶接口
// 应用与文件夹共用，置顶状态按团队共享
// 操作权限：应用/文件夹的管理权限（含团队 owner，以及继承生效时父文件夹的管理权限），
// 与"应用管理权限"完全一致，不额外放宽也不复用写权限。
// 置顶只影响列表排序：不修改 updateTime、不更新父文件夹时间、不记审计。
async function handler(
  req: ApiRequestProps<PinAppBodyType, PinAppQueryType>
): Promise<PinAppResponseType> {
  const {
    query: { appId },
    body: { isPinned }
  } = parseApiInput({
    req,
    querySchema: PinAppQuerySchema,
    bodySchema: PinAppBodySchema
  });

  const { app, teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  // 软删除的资源不应再被置顶，避免产生无效的置顶项
  if (app.deleteTime) {
    return Promise.reject(AppErrEnum.unExist);
  }

  await updateAppPin({ teamId, appId, isPinned });

  // 响应显式返回状态，客户端无需根据请求参数推断结果
  return PinAppResponseSchema.parse({ isPinned });
}

export default NextAPI(handler);
