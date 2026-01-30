import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemPluginDataset } from '@fastgpt/service/core/dataset/pluginDataset/schema';
import { refreshPluginDatasetsVersionKey } from '@fastgpt/service/core/dataset/pluginDataset/controller';
import {
  UpdatePluginDatasetStatusBodySchema,
  type UpdatePluginDatasetStatusBody,
  type UpdatePluginDatasetStatusResponse
} from '@fastgpt/global/openapi/core/plugin/admin/dataset/api';

async function handler(
  req: ApiRequestProps<UpdatePluginDatasetStatusBody>,
  _res: ApiResponseType<UpdatePluginDatasetStatusResponse>
): Promise<UpdatePluginDatasetStatusResponse> {
  await authSystemAdmin({ req });

  const { sourceId, status } = UpdatePluginDatasetStatusBodySchema.parse(req.body);

  await MongoSystemPluginDataset.updateOne({ sourceId }, { status }, { upsert: true });

  // 刷新 versionKey，使所有客户端缓存失效
  await refreshPluginDatasetsVersionKey();

  return { sourceId, status };
}

export default NextAPI(handler);
