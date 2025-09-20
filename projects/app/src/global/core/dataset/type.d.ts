import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetDataSchemaType, DatasetTagType } from '@fastgpt/global/core/dataset/type.d';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

/* ================= dataset ===================== */

/* ================= collection ===================== */
export type DatasetCollectionsListItemType = {
  _id: string;
  parentId?: DatasetCollectionSchemaType['parentId'];
  tmbId: DatasetCollectionSchemaType['tmbId'];
  name: DatasetCollectionSchemaType['name'];
  type: DatasetCollectionSchemaType['type'];
  createTime: DatasetCollectionSchemaType['createTime'];
  updateTime: DatasetCollectionSchemaType['updateTime'];
  forbid?: DatasetCollectionSchemaType['forbid'];
  trainingType?: DatasetCollectionSchemaType['trainingType'];
  tags?: string[];

  externalFileId?: string;

  fileId?: string;
  rawLink?: string;
  permission: DatasetPermission;

  dataAmount: number;
  trainingAmount: number;
  hasError?: boolean;
};

/* ================= data ===================== */
export type DatasetDataListItemType = {
  _id: string;
  datasetId: string;
  collectionId: string;
  q?: string;
  a?: string;
  imageId?: string;
  imageSize?: number;
  imagePreviewUrl?: string; //image preview url
  chunkIndex?: number;
  updated?: boolean;
};
