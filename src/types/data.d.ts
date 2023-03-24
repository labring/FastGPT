import type { DataSchema } from './mongoSchema';

export interface DataListItem extends DataSchema {
  trainingData: number;
  totalData: number;
}
