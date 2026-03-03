import type { OpenAPIPath } from '../../type';
import { DatasetDataPath } from './data';
import { DatasetCollectionPath } from './collection';

export const DatasetPath: OpenAPIPath = {
  ...DatasetDataPath,
  ...DatasetCollectionPath
};
