import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  DatasetTagType
} from '@fastgpt/global/core/dataset/type.d';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

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
};

/* ================= data ===================== */
export type DatasetDataListItemType = {
  _id: string;
  datasetId: string;
  collectionId: string;
  q: string; // embedding content
  a: string; // bonus content
  chunkIndex?: number;
  // indexes: DatasetDataSchemaType['indexes'];
};
