import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemPluginDataset } from '@fastgpt/service/core/dataset/pluginDataset/schema';
import {
  UpdatePluginDatasetStatusBodySchema,
  type UpdatePluginDatasetStatusBody,
  type UpdatePluginDatasetStatusResponse
} from '@/global/core/config/api';

async function handler(
  req: ApiRequestProps<UpdatePluginDatasetStatusBody>,
  _res: ApiResponseType<UpdatePluginDatasetStatusResponse>
): Promise<UpdatePluginDatasetStatusResponse> {
  await authSystemAdmin({ req });

  const { sourceId, status } = UpdatePluginDatasetStatusBodySchema.parse(req.body);

  await MongoSystemPluginDataset.findOneAndUpdate({ sourceId }, { status }, { upsert: true });

  return { sourceId, status };
}

export default NextAPI(handler);
