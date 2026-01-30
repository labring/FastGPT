import type { DatasetSourceInfo } from '@fastgpt/global/sdk/fastgpt-plugin';

export type PluginDatasetType = DatasetSourceInfo & {
  status: number;
};
