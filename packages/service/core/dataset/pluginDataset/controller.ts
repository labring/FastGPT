import { getVersionKey, refreshVersionKey } from '../../../common/cache';
import { VersionOnlyCacheKeyEnum } from '../../../common/cache/type';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { MongoSystemPluginDataset } from './schema';
import type { DatasetSourceInfo } from '@fastgpt/global/sdk/fastgpt-plugin';

export type PluginDatasetType = DatasetSourceInfo & {
  status: number;
};

export type GetPluginDatasetsParams = {
  versionKey?: string;
};

export type GetPluginDatasetsResponse = {
  isRefreshed: boolean;
  pluginDatasets?: PluginDatasetType[];
  versionKey?: string;
};

export async function getPluginDatasets(
  params: GetPluginDatasetsParams
): Promise<GetPluginDatasetsResponse> {
  const { versionKey } = params;

  const versionKeyInRedis = await getVersionKey(VersionOnlyCacheKeyEnum.pluginDatasets);

  if (versionKeyInRedis === versionKey) {
    return { isRefreshed: false };
  }

  try {
    const sourceList = await pluginClient.dataset.listSources();
    const configs = await MongoSystemPluginDataset.find({}, 'sourceId status').lean();
    const configMap = new Map(configs.map((c) => [c.sourceId, c.status]));

    const pluginDatasets = sourceList.map((source) => ({
      ...source,
      status: configMap.get(source.sourceId) ?? 1
    }));

    return {
      isRefreshed: true,
      pluginDatasets,
      versionKey: versionKeyInRedis
    };
  } catch (error) {
    console.warn('Failed to load plugin dataset sources:', error);
    return {
      isRefreshed: true,
      pluginDatasets: [],
      versionKey: versionKeyInRedis
    };
  }
}

export async function refreshPluginDatasetsVersionKey(): Promise<void> {
  await refreshVersionKey(VersionOnlyCacheKeyEnum.pluginDatasets);
}
