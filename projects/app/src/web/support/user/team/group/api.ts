import { DELETE, GET, POST } from '@/web/common/api/request';
import { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';

export type postCreateGroupData = {
  name: string;
  avatar?: string;
  members?: string[];
};

export type postUpdateGroupData = {
  groupId: string;
  name?: string;
  avatar?: string;
  members?: string[];
};

export const getGroupList = () => GET<MemberGroupListType>('/proApi/support/user/team/group/list');

export const postCreateGroup = (data: postCreateGroupData) =>
  POST('/proApi/support/user/team/group/create', data);

export const deleteGroup = (groupId: string) =>
  DELETE('/proApi/support/user/team/group/delete', { groupId });

export const putUpdateGroup = (data: postUpdateGroupData) =>
  POST('/proApi/support/user/team/group/update', data);
