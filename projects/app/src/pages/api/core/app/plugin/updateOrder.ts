import { NextAPI } from '@/service/middleware/entry';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type updatePluginOrderQuery = {};

export type updatePluginOrderBody = {
  plugins: {
    pluginId: string;
    pluginOrder: number;
  }[];
};

export type updatePluginOrderResponse = {};

async function handler(
  req: ApiRequestProps<updatePluginOrderBody, updatePluginOrderQuery>,
  res: ApiResponseType<any>
): Promise<updatePluginOrderResponse> {
  await authSystemAdmin({ req });
  const { plugins } = req.body;

  await MongoSystemPlugin.bulkWrite(
    plugins.map((plugin, index) => ({
      updateOne: {
        filter: { pluginId: plugin.pluginId },
        update: { $set: { pluginOrder: index } },
        upsert: true
      }
    }))
  );

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
