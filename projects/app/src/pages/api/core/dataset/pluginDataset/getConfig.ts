import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import {
  GetConfigQuerySchema,
  type GetConfigResponseType
} from '@fastgpt/global/openapi/core/dataset/pluginDataset/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<GetConfigResponseType>
): Promise<GetConfigResponseType> {
  const { sourceId } = GetConfigQuerySchema.parse(req.query);

  return await pluginClient.dataset.getSourceConfig(sourceId);
}

export default NextAPI(handler);
