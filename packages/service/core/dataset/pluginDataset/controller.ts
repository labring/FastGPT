import { getCachedData, refreshVersionKey } from '../../../common/cache';
import { SystemCacheKeyEnum } from '../../../common/cache/type';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { MongoSystemPluginDataset } from './schema';
import type { PluginDatasetType } from './type';

export type { PluginDatasetType } from './type';

export async function refreshPluginDatasets(): Promise<PluginDatasetType[]> {
  try {
    const sourceList = await pluginClient.dataset.listSources();
    const configs = await MongoSystemPluginDataset.find({}, 'sourceId status').lean();
    const configMap = new Map(configs.map((c) => [c.sourceId, c.status]));

    return sourceList.map((source) => ({
      ...source,
      status: configMap.get(source.sourceId) ?? 1
    }));
  } catch (error) {
    console.warn('Failed to load plugin dataset sources:', error);
    return [];
  }
}

export async function getPluginDatasets(): Promise<PluginDatasetType[]> {
  return getCachedData(SystemCacheKeyEnum.pluginDatasets);
}

export async function refreshPluginDatasetsVersionKey(): Promise<void> {
  await refreshVersionKey(SystemCacheKeyEnum.pluginDatasets);
}
