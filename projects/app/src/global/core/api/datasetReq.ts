import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
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
