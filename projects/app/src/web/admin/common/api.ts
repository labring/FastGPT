import { POST } from '@/web/admin/common/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type { LogLevelEnum } from '@fastgpt/service/common/system/log/constant';
import type { SystemLogType } from '@fastgpt/service/common/system/log/type';

/** 日志列表入参（原 pro/admin 的 listBody 内联） */
export type AdminLogListBody = PaginationProps<{
  search?: string;
  logLevel?: LogLevelEnum[];
}>;

export const getSystemLogList = (data: AdminLogListBody) =>
  POST<PaginationResponse<SystemLogType>>('/proApi/admin/common/log/list', data);
