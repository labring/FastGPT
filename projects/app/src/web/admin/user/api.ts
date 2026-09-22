import { POST } from '@/web/admin/common/request';
import type {
  GetUsersBodyType,
  GetUsersResponseType
} from '@fastgpt/global/openapi/admin/user/api';

export type AdminAddUserData = {
  username: string;
  password: string;
};

export type AdminUpdateUserData = {
  _id: string;
  username?: string;
  password?: string;
  status?: string;
};

export type AdminDeleteUserData = {
  username: string;
};

export const getUsers = (data: GetUsersBodyType) =>
  POST<GetUsersResponseType>('/proApi/admin/user/getUsers', data, { maxQuantity: 1 });

export const addUser = (data: AdminAddUserData) => POST('/proApi/admin/user/addUser', data);

export const updateUser = (data: AdminUpdateUserData) =>
  POST('/proApi/admin/user/updateUser', data);

export const deleteUser = (data: AdminDeleteUserData) => POST('/proApi/admin/user/delete', data);
