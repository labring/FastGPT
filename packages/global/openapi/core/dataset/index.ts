import type { OpenAPIPath } from '../../type';
import { DatasetDataPath } from './data';
import { DatasetCollectionChunksPath } from './collection';

export const DatasetPath: OpenAPIPath = {
  ...DatasetDataPath,
  ...DatasetCollectionChunksPath
};
