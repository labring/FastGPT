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
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

/* ===== dataset ===== */

/* ======= collections =========== */
export type GetDatasetCollectionsProps = PaginationProps<{
  datasetId: string;
  parentId?: ParentIdType;
  searchText?: string;
  filterTags?: string[];
  simple?: boolean;
  selectFolder?: boolean;
}>;

/* ==== data ===== */
