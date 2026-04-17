import type { TeamMetaType, UserModelSchema } from '../type';
import { TeamMemberRoleEnum, TeamMemberStatusEnum } from './constant';
import type { GroupMemberRole } from '../../permission/memberGroup/constant';
import { TeamPermission } from '../../permission/user/controller';
import { z } from 'zod';

export const LafAccountSchema = z.object({
  appid: z.string(),
  token: z.string(),
  pat: z.string()
});
export type LafAccountType = z.infer<typeof LafAccountSchema>;

export const OpenaiAccountSchema = z.object({
  key: z.string(),
  baseUrl: z.string()
});
export type OpenaiAccountType = z.infer<typeof OpenaiAccountSchema>;

export const ThidPartyAccountSchema = z.object({
  lafAccount: LafAccountSchema.optional(),
  openaiAccount: OpenaiAccountSchema.optional(),
  externalWorkflowVariables: z.record(z.string(), z.string()).optional()
});
export type ThirdPartyAccountType = z.infer<typeof ThidPartyAccountSchema>;

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
  notificationAccount?: string;
  meta?: TeamMetaType;
  deleteTime?: Date;
} & ThirdPartyAccountType;

export type tagsType = {
  label: string;
  key: string;
};

export type TeamTagSchema = TeamTagItemType & {
  _id: string;
  teamId: string;
  createTime: Date;
  updateTime?: Date;
};

export type TeamMemberSchema = {
  _id: string;
  teamId: string;
  userId: string;
  createTime: Date;
  updateTime?: Date;
  name: string;
  role: TeamMemberRoleEnum;
  status: TeamMemberStatusEnum;
  avatar: string;
};

export type TeamMemberWithTeamAndUserSchema = TeamMemberSchema & {
  team: TeamSchema;
  user: UserModelSchema;
};

export const TeamTmbItemSchema = ThidPartyAccountSchema.extend({
  userId: z.string(),
  teamId: z.string(),
  teamAvatar: z.string().optional(),
  teamName: z.string(),
  memberName: z.string(),
  avatar: z.string(),
  balance: z.number().optional(),
  tmbId: z.string(),
  teamDomain: z.string(),
  role: z.enum(TeamMemberRoleEnum),
  status: z.enum(TeamMemberStatusEnum),
  notificationAccount: z.string().optional(),
  permission: z.instanceof(TeamPermission),
  isWecomTeam: z.boolean().optional()
});
export type TeamTmbItemType = z.infer<typeof TeamTmbItemSchema>;

export type TeamMemberItemType<
  Options extends {
    withPermission?: boolean;
    withOrgs?: boolean;
    withGroupRole?: boolean;
  } = { withPermission: true; withOrgs: true; withGroupRole: false }
> = {
  userId: string;
  tmbId: string;
  teamId: string;
  memberName: string;
  avatar: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  contact?: string;
  createTime: Date;
  updateTime?: Date;
} & (Options extends { withPermission: true }
  ? {
      permission: TeamPermission;
    }
  : {}) &
  (Options extends { withOrgs: true }
    ? {
        orgs?: string[]; // full path name, pattern: /teamName/orgname1/orgname2
      }
    : {}) &
  (Options extends { withGroupRole: true }
    ? {
        groupRole?: `${GroupMemberRole}`;
      }
    : {});

export type TeamTagItemType = {
  label: string;
  key: string;
};

export type TeamInvoiceHeaderType = {
  teamName: string;
  unifiedCreditCode: string;
  companyAddress?: string;
  companyPhone?: string;
  bankName?: string;
  bankAccount?: string;
  needSpecialInvoice: boolean;
  contactPhone: string;
  emailAddress: string;
};

export type TeamInvoiceHeaderInfoSchemaType = TeamInvoiceHeaderType & {
  _id: string;
  teamId: string;
};
