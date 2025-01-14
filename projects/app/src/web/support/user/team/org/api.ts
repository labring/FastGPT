import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  postCreateOrgData,
  putUpdateOrgData,
  putUpdateOrgMembersData
} from '@fastgpt/global/support/user/team/org/api';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import { putMoveOrgType } from '@fastgpt/global/support/user/team/org/api';

export const getOrgList = () => GET<OrgType[]>('/proApi/support/user/team/org/list');

export const postCreateOrg = (data: postCreateOrgData) =>
  POST('/proApi/support/user/team/org/create', data);

export const deleteOrg = (orgId: string) =>
  DELETE('/proApi/support/user/team/org/delete', { orgId });

export const deleteOrgMember = (orgId: string, tmbId: string) =>
  DELETE('/proApi/support/user/team/org/deleteMember', { orgId, tmbId });

export const putMoveOrg = (data: putMoveOrgType) => PUT('/proApi/support/user/team/org/move', data);

export const putUpdateOrg = (data: putUpdateOrgData) =>
  PUT('/proApi/support/user/team/org/update', data);

export const putUpdateOrgMembers = (data: putUpdateOrgMembersData) =>
  PUT('/proApi/support/user/team/org/updateMembers', data);

// export const putChnageOrgOwner = (data: putChnageOrgOwnerData) =>
//   PUT('/proApi/support/user/team/org/changeOwner', data);
