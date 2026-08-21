import { DELETE, POST, PUT } from '@/web/common/api/request';
import type {
  postCreateOrgData,
  putUpdateOrgData,
  putUpdateOrgMembersData
} from '@fastgpt/global/support/user/team/org/api';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import type { putMoveOrgType } from '@fastgpt/global/support/user/team/org/api';

export const getOrgList = (params: {
  orgId: string;
  withPermission?: boolean;
  searchKey?: string;
}) => POST<OrgListItemType[]>(`/proApi/support/user/team/org/list`, params);

export const postCreateOrg = (data: postCreateOrgData) =>
  POST('/proApi/support/user/team/org/create', data);

export const deleteOrg = (orgId: string) =>
  DELETE('/proApi/support/user/team/org/delete', { orgId });

export const putMoveOrg = (data: putMoveOrgType) => PUT('/proApi/support/user/team/org/move', data);

export const putUpdateOrg = (data: putUpdateOrgData) =>
  PUT('/proApi/support/user/team/org/update', data);

// org members
export const putUpdateOrgMembers = (data: putUpdateOrgMembersData) =>
  PUT('/proApi/support/user/team/org/updateMembers', data);

export const deleteOrgMember = (orgId: string, tmbId: string) =>
  DELETE('/proApi/support/user/team/org/deleteMember', { orgId, tmbId });
