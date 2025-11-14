import { GET, POST, PUT } from '@/web/common/api/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { OperationListItemType } from '@fastgpt/global/support/user/audit/type';
import type { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export const getOperationLogs = (
  props: PaginationProps & {
    tmbIds?: string[];
    events?: AuditEventEnum[];
  }
) => POST<PaginationResponse<OperationListItemType>>(`/proApi/support/user/audit/list`, props);
