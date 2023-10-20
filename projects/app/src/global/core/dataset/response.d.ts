import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type.d';

/* ================= dataset ===================== */

/* ================= collection ===================== */
export type DatasetCollectionsListItemType = {
  _id: string;
  parentId?: string;
  name: string;
  type: DatasetCollectionSchemaType['type'];
  updateTime: Date;
  dataAmount?: number;
  trainingAmount: number;
  metadata: DatasetCollectionSchemaType['metadata'];
};

/* ================= data ===================== */
export type DatasetDataListItemType = {
  id: string;
  q: string; // embedding content
  a: string; // bonus content
};
