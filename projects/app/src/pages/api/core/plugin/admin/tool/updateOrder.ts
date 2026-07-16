import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdateToolOrderBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type updateToolOrderQuery = Record<string, never>;

export type updateToolOrderBody = UpdateToolOrderBodyType;

export type updateToolOrderResponse = Record<string, never>;

async function handler(
  req: ApiRequestProps<updateToolOrderBody, updateToolOrderQuery>,
  _res: ApiResponseType<any>
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
  return {};
}

export default NextAPI(handler);
