import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type {
  GetConfigQueryType,
  GetConfigResponseType
} from '@fastgpt/global/openapi/core/dataset/pluginDataset/api';

async function handler(
  req: ApiRequestProps<{}, GetConfigQueryType>,
  _res: ApiResponseType<GetConfigResponseType>
): Promise<GetConfigResponseType> {
  const { sourceId } = req.query;

  if (!sourceId) {
    return Promise.reject('sourceId is required');
  }

  return await pluginClient.dataset.getSourceConfig(sourceId);
}

export default NextAPI(handler);
