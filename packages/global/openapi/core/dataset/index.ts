import type { OpenAPIPath } from '../../type';
import { DatasetDataPath } from './data';
import { DatasetCollectionPath } from './collection';
import { PluginDatasetPath } from './pluginDataset';

export const DatasetPath: OpenAPIPath = {
  ...DatasetDataPath,
  ...DatasetCollectionPath,
  ...PluginDatasetPath
};
