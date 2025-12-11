import z from 'zod';
import type { LangEnum } from '../../common/i18n/type';
import type { TeamPermission } from '../permission/user/controller';
import type { UserStatusEnum } from './constant';
import { TeamMemberStatusEnum } from './team/constant';
import type { TeamTmbItemType } from './team/type';

export type UserModelSchema = {
  _id: string;
  username: string;
  password: string;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
  language: `${LangEnum}`;
  status: `${UserStatusEnum}`;
  lastLoginTmbId?: string;
  passwordUpdateTime?: Date;
  fastgpt_sem?: {
    keyword: string;
  };
  contact?: string;
};

export type UserType = {
  _id: string;
  username: string;
  avatar: string; // it should be team member's avatar after 4.8.18
  timezone: string;
  language?: `${LangEnum}`;
  promotionRate: UserModelSchema['promotionRate'];
  team: TeamTmbItemType;
  permission: TeamPermission;
  contact?: string;
};

export const SourceMemberSchema = z.object({
  name: z.string(),
  avatar: z.string(),
  status: z.enum(TeamMemberStatusEnum)
});
export type SourceMemberType = z.infer<typeof SourceMemberSchema>;
