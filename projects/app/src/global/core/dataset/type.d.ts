import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetDataSchemaType, DatasetTagType } from '@fastgpt/global/core/dataset/type.d';
import type { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import type { CollectionStatusEnum } from '@fastgpt/global/core/dataset/constants';

/* ================= dataset ===================== */

/* ================= collection ===================== */
export type DatasetCollectionsListItemType = {
  tableSchemaDescription: DatasetCollectionSchemaType['tableSchema']['description'];
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

  // 计算得出的状态字段
  // - 对于普通文件：单一状态值
  // - 对于 folder：使用 matchingStatuses 数组（递归聚合模式）
  status?: CollectionStatusEnum; // 文件的单一状态（folder 无此字段）
  matchingStatuses?: CollectionStatusEnum[]; // folder 的匹配状态数组（仅 folder 类型有此字段）

  // For database type datasets, include table schema description
  tableSchemaDescription?: string;
  tableSchema?: DatasetCollectionSchemaType['tableSchema'];

  // For structureDocument type datasets, include row and column count
  rows?: number;
  cols?: number;
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
