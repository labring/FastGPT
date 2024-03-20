import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { QueryUserParams, UserListItemType } from '@/global/support/api/userRes';
import { UserManageType } from '@fastgpt/global/support/user/manage/api';
import { hashStr } from '@fastgpt/global/common/string/tools';

export const queryUsers = (data: QueryUserParams) =>
  GET<UserListItemType[]>(`/support/user/manage/list`, data);
export const postCreateUser = ({ username, inviterId, password, status }: UserManageType) =>
  POST<UserListItemType[]>(`/support/user/manage/create`, {
    username,
    inviterId,
    status,
    password: hashStr(password)
  });
export const putUpdateUser = ({ username, inviterId, password, status, _id }: UserManageType) =>
  PUT<UserListItemType[]>(`/support/user/manage/update`, {
    _id,
    username,
    inviterId,
    status,
    password: hashStr(password)
  });
export const delRemoveUser = (userId: string) =>
  DELETE<UserListItemType[]>(`/support/user/manage/del`, { userId });
