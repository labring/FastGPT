import { GET, POST } from '@/web/common/api/request';
import type { UserInformType } from '@fastgpt/global/support/user/inform/type';
import type { GetUnreadInformResponseType } from '@fastgpt/global/openapi/support/user/inform/api';
import type { SystemMsgModalValueType } from '@fastgpt/global/openapi/admin/support/user/inform/api';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';

export const getInforms = (data: PaginationProps) =>
  POST<PaginationResponse<UserInformType>>(`/proApi/support/user/inform/list`, data);

export const getUnreadCount = () =>
  GET<GetUnreadInformResponseType>('/proApi/support/user/inform/countUnread');
export const readInform = (id: string) => GET(`/proApi/support/user/inform/read`, { id });

export const getSystemMsgModalData = () =>
  GET<SystemMsgModalValueType>(`/proApi/support/user/inform/getSystemMsgModal`);
