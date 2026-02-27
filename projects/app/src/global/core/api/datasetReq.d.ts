import type {
  CollectionStatusEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchTestItemType } from '@/types/core/dataset';
import { UploadChunkItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';

/* ===== dataset ===== */

/* ======= collections =========== */

export type GetDatasetCollectionsProps = PaginationProps<{
  datasetId: string;
  parentId?: string;
  searchText?: string;
  filterTags?: string[];
  simple?: boolean;
  selectFolder?: boolean;
  // 排序参数
  sortBy?: 'name' | 'updateTime' | 'createTime' | 'dataAmount';
  sortOrder?: 'asc' | 'desc';
  // 状态筛选参数
  status?: CollectionStatusEnum | CollectionStatusEnum[];
}>;

/* ==== data ===== */
