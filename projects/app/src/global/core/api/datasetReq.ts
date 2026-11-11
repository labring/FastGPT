import type { PaginationProps } from '@fastgpt/global/openapi/api';
import type { ListCollectionV2BodyType } from '@fastgpt/global/openapi/core/dataset/collection/api';

/* ===== dataset ===== */

/* ======= collections =========== */
/** 列表请求参数：字段类型取自 API schema，客户端可省略带默认值的字段。 */
export type GetDatasetCollectionsProps = PaginationProps<
  Pick<ListCollectionV2BodyType, 'datasetId'> &
    Partial<
      Pick<
        ListCollectionV2BodyType,
        | 'parentId'
        | 'searchText'
        | 'tagFilters'
        | 'sortBy'
        | 'sortOrder'
        | 'simple'
        | 'selectFolder'
      >
    >
>;

/* ==== data ===== */
