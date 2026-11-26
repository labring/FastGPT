import { POST } from '@/web/common/api/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type {
  AuditFilterType,
  AuditListItemType
} from '@fastgpt/global/openapi/support/user/team/audit/api';

/** 列表与导出使用同一份筛选合约，分页只在列表请求中附加。 */
export const getOperationLogs = (props: PaginationProps<AuditFilterType>) =>
  POST<PaginationResponse<AuditListItemType>>('/proApi/support/user/team/audit/list', props);
