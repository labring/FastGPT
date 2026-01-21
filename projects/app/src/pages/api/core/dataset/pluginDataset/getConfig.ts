import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { PluginDatasetSourceConfig } from '@fastgpt/global/core/dataset/apiDataset/type';

export type GetPluginDatasetConfigQuery = { sourceId: string };
export type GetPluginDatasetConfigResponse = PluginDatasetSourceConfig;

async function handler(
  req: ApiRequestProps<{}, GetPluginDatasetConfigQuery>
): Promise<GetPluginDatasetConfigResponse> {
  const { sourceId } = req.query;

  if (!sourceId) {
    return Promise.reject('sourceId is required');
  }

  const res = await pluginClient.dataset.source.config({ query: { sourceId } });

  if (res.status === 200) {
    return res.body as GetPluginDatasetConfigResponse;
  }

  return Promise.reject(res.body);
}

export default NextAPI(handler);
