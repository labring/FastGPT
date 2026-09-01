import type { PaginationProps } from '@fastgpt/global/openapi/api';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type CollectionTagFilterItem } from '@fastgpt/global/core/dataset/type';

/* ===== dataset ===== */

/* ======= collections =========== */
export type GetDatasetCollectionsProps = PaginationProps<{
  datasetId: string;
  parentId?: ParentIdType;
  searchText?: string;
  tagFilters?: CollectionTagFilterItem[];
  simple?: boolean;
  selectFolder?: boolean;
}>;

/* ==== data ===== */
