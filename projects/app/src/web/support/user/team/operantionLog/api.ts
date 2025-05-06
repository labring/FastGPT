import { GET, POST, PUT } from '@/web/common/api/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { OperationListItemType } from '@fastgpt/global/support/operationLog/type';
import type { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';

export const getOperationLogs = (
  props: PaginationProps & {
    tmbIds?: string[];
    events?: OperationLogEventEnum[];
  }
) =>
  POST<PaginationResponse<OperationListItemType>>(
    `/proApi/support/user/team/operationLog/list`,
    props
  );
