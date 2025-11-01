import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { PluginStatusEnum } from '@fastgpt/global/core/app/plugin/constants';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { CreateAppPluginBodyType } from '@fastgpt/global/openapi/core/plugin/admin/api';

export type createPluginQuery = {};

export type createPluginBody = CreateAppPluginBodyType;

export type createPluginResponse = {};

async function handler(
  req: ApiRequestProps<createPluginBody, createPluginQuery>,
  res: ApiResponseType<any>
): Promise<createPluginResponse> {
  await authSystemAdmin({ req });
  const {
    name,
    avatar,
    intro,
    pluginTags,
    templateType,
    inputListVal,
    originCost,
    currentCost,
    hasTokenFee,
    status,
    defaultInstalled,
    associatedPluginId,
    userGuide,
    author
  } = req.body;

  const pluginId = getNanoid(12);

  const firstPlugin = await MongoSystemPlugin.findOne().sort({ pluginOrder: 1 }).lean();
  const pluginOrder = firstPlugin ? (firstPlugin.pluginOrder ?? 0) - 1 : 0;

  await MongoSystemPlugin.create({
    pluginId,
    status: status ?? PluginStatusEnum.Normal,
    defaultInstalled: defaultInstalled ?? false,
    inputListVal,
    originCost,
    currentCost,
    hasTokenFee,
    pluginOrder,
    customConfig: {
      name,
      avatar,
      intro,
      version: getNanoid(),
      pluginTags,
      templateType,
      associatedPluginId,
      userGuide,
      author
    }
  });

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
