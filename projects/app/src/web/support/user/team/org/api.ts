import { DELETE, POST, PUT } from '@/web/common/api/request';
import type {
  CreateOrgBodyType,
  ListOrgBodyType,
  MoveOrgBodyType,
  UpdateOrgBodyType,
  UpdateOrgMembersBodyType
} from '@fastgpt/global/openapi/support/user/team/org/api';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';

export const getOrgList = (params: ListOrgBodyType) =>
  POST<OrgListItemType[]>(`/proApi/support/user/team/org/list`, params);

export const postCreateOrg = (data: CreateOrgBodyType) =>
  POST('/proApi/support/user/team/org/create', data);

export const deleteOrg = (orgId: string) =>
  DELETE('/proApi/support/user/team/org/delete', { orgId });

export const putMoveOrg = (data: MoveOrgBodyType) =>
  PUT('/proApi/support/user/team/org/move', data);

export const putUpdateOrg = (data: UpdateOrgBodyType) =>
  PUT('/proApi/support/user/team/org/update', data);

// org members
export const putUpdateOrgMembers = (data: UpdateOrgMembersBodyType) =>
  PUT('/proApi/support/user/team/org/updateMembers', data);

export const deleteOrgMember = (orgId: string, tmbId: string) =>
  DELETE('/proApi/support/user/team/org/deleteMember', { orgId, tmbId });
