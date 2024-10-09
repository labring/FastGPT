import type { UserModelSchema } from '../type';
import type { TeamMemberRoleEnum, TeamMemberStatusEnum } from './constant';
import { LafAccountType } from './type';
import { PermissionValueType, ResourcePermissionType } from '../../permission/type';
import { TeamPermission } from '../../permission/user/controller';

export type TeamSchema = {
  _id: string;
  name: string;
  ownerId: string;
  avatar: string;
  createTime: Date;
  balance: number;
  teamDomain: string;
  limit: {
    lastExportDatasetTime: Date;
    lastWebsiteSyncTime: Date;
  };
  lafAccount: LafAccountType;
  notificationAccount?: string;
};

export type tagsType = {
  label: string;
  key: string;
};

export type TeamTagSchema = TeamTagItemType & {
  _id: string;
  teamId: string;
  createTime: Date;
};

export type TeamMemberSchema = {
  _id: string;
  teamId: string;
  userId: string;
  createTime: Date;
  name: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  defaultTeam: boolean;
};

export type TeamMemberWithUserSchema = Omit<TeamMemberSchema, 'userId'> & {
  userId: UserModelSchema;
};

export type TeamMemberWithTeamSchema = Omit<TeamMemberSchema, 'teamId'> & {
  teamId: TeamSchema;
};

export type TeamMemberWithTeamAndUserSchema = Omit<TeamMemberWithTeamSchema, 'userId'> & {
  userId: UserModelSchema;
};

export type TeamTmbItemType = {
  userId: string;
  teamId: string;
  teamName: string;
  memberName: string;
  avatar: string;
  balance: number;
  tmbId: string;
  teamDomain: string;
  defaultTeam: boolean;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  lafAccount?: LafAccountType;
  notificationAccount?: string;
  permission: TeamPermission;
};

export type TeamMemberItemType = {
  userId: string;
  tmbId: string;
  teamId: string;
  memberName: string;
  avatar: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  permission: TeamPermission;
};

export type TeamTagItemType = {
  label: string;
  key: string;
};

export type LafAccountType = {
  token: string;
  appid: string;
  pat: string;
};

export type TeamInvoiceHeaderType = {
  teamName: string;
  unifiedCreditCode: string;
  companyAddress?: string;
  companyPhone?: string;
  bankName?: string;
  bankAccount?: string;
  needSpecialInvoice: boolean;
  emailAddress: string;
};

export type TeamInvoiceHeaderInfoSchemaType = TeamInvoiceHeaderType & {
  _id: string;
  teamId: string;
};
