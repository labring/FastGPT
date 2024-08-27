import { DELETE, GET, POST } from '@/web/common/api/request';

export type postCreateGroupData = {
  name: string;
  avatar?: string;
  members?: string[];
};

export const getGroupList = () =>
  GET<MemberGroupSchemaType[]>('/proApi/support/user/team/group/list');

export const postCreateGroup = (data: postCreateGroupData) =>
  POST('/proApi/support/user/team/group/create', data);

export const deleteGroup = (groupId: string) =>
  DELETE('/proApi/support/user/team/group/delete', { groupId });
