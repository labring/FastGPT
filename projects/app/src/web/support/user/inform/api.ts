import { GET, POST, PUT } from '@/web/common/api/request';
import type { PagingData, RequestPaging } from '@/types';
import type { UserInformSchema } from '@fastgpt/global/support/user/inform/type';

export const getInforms = (data: RequestPaging) =>
  POST<PagingData<UserInformSchema>>(`/plusApi/support/user/inform/list`, data);

export const getUnreadCount = () => GET<number>(`/plusApi/support/user/inform/countUnread`);
export const readInform = (id: string) => GET(`/plusApi/support/user/inform/read`, { id });
