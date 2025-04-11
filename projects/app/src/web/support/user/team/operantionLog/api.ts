import { GET, POST, PUT } from '@/web/common/api/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { OperationLogType } from '@fastgpt/global/support/operationLog/type';

export const getOperationLogs = (props: PaginationProps<PaginationProps>) =>
  POST<PaginationResponse<OperationLogType>>(`/proApi/support/user/team/operationLog/list`, props);
