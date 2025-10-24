import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { PluginStatusEnum } from '@fastgpt/global/core/app/plugin/constants';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type createPluginQuery = {};

export type createPluginBody = {
  name: string;
  avatar: string;
  intro?: string;
  pluginTags?: string[];
  templateType?: string;
  originCost?: number;
  currentCost?: number;
  hasTokenFee?: boolean;
  status?: number;
  defaultInstalled?: boolean;
  inputListVal?: Record<string, any>;
  associatedPluginId?: string;
  userGuide?: string;
  author?: string;
};

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

  const pluginId = `${PluginSourceEnum.commercial}-${getNanoid(12)}`;

  await MongoSystemPlugin.create({
    pluginId,
    status: status ?? PluginStatusEnum.Normal,
    defaultInstalled: defaultInstalled ?? true,
    inputListVal,
    originCost,
    currentCost,
    hasTokenFee,
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
