import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { CreateAppToolBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

export type createPluginQuery = {};

export type createPluginBody = CreateAppToolBodyType;

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
    tagIds,
    inputListVal,
    originCost,
    currentCost,
    systemKeyCost,
    hasTokenFee,
    status,
    defaultInstalled,
    associatedPluginId,
    userGuide,
    author
  } = req.body;

  const pluginId = `${AppToolSourceEnum.commercial}-${getNanoid(12)}`;

  const firstPlugin = await MongoSystemTool.findOne().sort({ pluginOrder: 1 }).lean();
  const pluginOrder = firstPlugin ? (firstPlugin.pluginOrder ?? 0) - 1 : 0;

  await MongoSystemTool.create({
    pluginId,
    status: status ?? PluginStatusEnum.Normal,
    defaultInstalled: defaultInstalled ?? false,
    inputListVal,
    originCost,
    currentCost,
    systemKeyCost,
    hasTokenFee,
    pluginOrder,
    customConfig: {
      name,
      avatar,
      intro,
      version: getNanoid(),
      tags: tagIds,
      associatedPluginId,
      userGuide,
      author
    }
  });

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
