import { POST } from '@/web/admin/common/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type { TeamAuditListItemType } from '@fastgpt/global/support/user/audit/type';
import type { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export const getOperationLogs = (
  props: PaginationProps & {
    tmbIds?: string[];
    events?: AdminAuditEventEnum[];
  }
) => POST<PaginationResponse<TeamAuditListItemType>>('/proApi/support/user/audit/adminList', props);
