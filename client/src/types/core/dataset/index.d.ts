import { FileStatusEnum } from '@/constants/dataset';
import { PgDataItemType } from './data';
import { VectorModelItemType } from '../../model';
import type { kbSchema } from '../../mongoSchema';

export type DatasetsItemType = Omit<kbSchema, 'vectorModel'> & {
  vectorModel: VectorModelItemType;
};

export type DatasetItemType = {
  _id: string;
  avatar: string;
  name: string;
  userId: string;
  vectorModel: VectorModelItemType;
  tags: string;
};

export type DatasetPathItemType = {
  parentId: string;
  parentName: string;
};

export type SearchTestItemType = {
  id: string;
  kbId: string;
  text: string;
  time: Date;
  results: (PgDataItemType & { score: number })[];
};

export type SelectedDatasetType = { kbId: string; vectorModel: VectorModelItemType }[];
