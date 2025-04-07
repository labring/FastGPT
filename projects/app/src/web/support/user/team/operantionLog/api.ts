import { GET, POST, PUT } from '@/web/common/api/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { operationLogType } from '@fastgpt/global/support/operationLog/type';

export const getOperationLogs = (props: PaginationProps<PaginationProps>) =>
  POST<PaginationResponse<operationLogType>>(`/proApi/support/user/team/operationLog/list`, props);
