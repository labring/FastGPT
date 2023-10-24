import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import type { RequestPaging } from '@/types';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';
import type { SearchTestItemType } from '@/types/core/dataset';
import { DatasetChunkItemType, UploadChunkItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';

/* ===== dataset ===== */
export type DatasetUpdateParams = {
  id: string;
  parentId?: string;
  tags?: string;
  name?: string;
  avatar?: string;
};
export type CreateDatasetParams = {
  parentId?: string;
  name: string;
  tags: string[];
  avatar: string;
  vectorModel?: string;
  type: `${DatasetTypeEnum}`;
};

export type SearchTestProps = {
  datasetId: string;
  text: string;
};

/* ======= collections =========== */
export type GetDatasetCollectionsProps = RequestPaging & {
  datasetId: string;
  parentId?: string;
  searchText?: string;
  simple?: boolean;
  selectFolder?: boolean;
};
export type CreateDatasetCollectionParams = {
  datasetId: string;
  parentId?: string;
  name: string;
  type: `${DatasetCollectionTypeEnum}`;
  metadata?: DatasetCollectionSchemaType['metadata'];
  updateTime?: string;
};
export type UpdateDatasetCollectionParams = {
  id: string;
  parentId?: string;
  name?: string;
  metadata?: DatasetCollectionSchemaType['metadata'];
};

/* ==== data ===== */
export type SetOneDatasetDataProps = {
  id?: string;
  datasetId: string;
  collectionId: string;
  q?: string; // embedding content
  a?: string; // bonus content
};
export type PushDataProps = {
  collectionId: string;
  data: DatasetChunkItemType[];
  mode: `${TrainingModeEnum}`;
  prompt?: string;
  billId?: string;
};

export type GetDatasetDataListProps = RequestPaging & {
  searchText?: string;
  collectionId: string;
};
