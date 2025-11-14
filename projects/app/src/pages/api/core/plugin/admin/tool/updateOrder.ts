import { NextAPI } from '@/service/middleware/entry';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdateToolOrderBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type updateToolOrderQuery = {};

export type updateToolOrderBody = UpdateToolOrderBodyType;

export type updateToolOrderResponse = {};

async function handler(
  req: ApiRequestProps<updateToolOrderBody, updateToolOrderQuery>,
  res: ApiResponseType<any>
): Promise<updateToolOrderResponse> {
  await authSystemAdmin({ req });
  const { plugins } = req.body;

  await MongoSystemTool.bulkWrite(
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
