import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';
import {
  postCreateGroupData,
  putUpdateGroupData
} from '@fastgpt/global/support/user/team/group/api';

export const getGroupList = () => GET<MemberGroupListType>('/proApi/support/user/team/group/list');

export const postCreateGroup = (data: postCreateGroupData) =>
  POST('/proApi/support/user/team/group/create', data);

export const deleteGroup = (groupId: string) =>
  DELETE('/proApi/support/user/team/group/delete', { groupId });

export const putUpdateGroup = (data: putUpdateGroupData) =>
  PUT('/proApi/support/user/team/group/update', data);
