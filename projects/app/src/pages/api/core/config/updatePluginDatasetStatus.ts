import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemPluginDataset } from '@fastgpt/service/core/dataset/pluginDataset/schema';

export type UpdatePluginDatasetStatusBody = {
  sourceId: string;
  status: number; // 0 = 关闭, 1 = 开启
};

export type UpdatePluginDatasetStatusResponse = {
  sourceId: string;
  status: number;
};

async function handler(
  req: ApiRequestProps<UpdatePluginDatasetStatusBody>,
  _res: ApiResponseType<UpdatePluginDatasetStatusResponse>
): Promise<UpdatePluginDatasetStatusResponse> {
  await authSystemAdmin({ req });

  const { sourceId, status } = req.body;

  if (!sourceId || ![0, 1].includes(status)) {
    throw new Error('Invalid sourceId or status');
  }

  await MongoSystemPluginDataset.findOneAndUpdate({ sourceId }, { status }, { upsert: true });

  return { sourceId, status };
}

export default NextAPI(handler);
