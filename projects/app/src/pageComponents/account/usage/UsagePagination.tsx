import React from 'react';
import Pagination from '@fastgpt/web/components/common/Pagination';
import type { UsageFilterController } from './useUsageFilterController';

/** 保持通用分页的布局，由页面仲裁器发起请求，避免分页创建第二套请求状态。 */
const UsagePagination = ({ controller }: { controller: UsageFilterController }) => {
  const total = controller.result?.view === 'detail' ? controller.result.data.total : 0;
  return (
    <Pagination
      total={total}
      page={controller.page}
      pageSize={controller.pageSize}
      pageSizeOptions={controller.pageSizeOptions}
      isLoading={controller.loading}
      onPageChange={controller.changePage}
      onPageSizeChange={controller.changePageSize}
    />
  );
};
export default React.memo(UsagePagination);
