import type { LangEnum } from '../../common/i18n/type';
import type { TeamPermission } from '../permission/user/controller';
import type { UserStatusEnum } from './constant';
import { TeamMemberStatusEnum } from './team/constant';
import type { TeamTmbItemType } from './team/type';
import z from 'zod';

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
  name: z.string().meta({ example: '张三', description: '成员名称' }),
  avatar: z.string().nullish().meta({ description: '成员头像' }),
  status: z
    .enum(TeamMemberStatusEnum)
    .meta({ example: TeamMemberStatusEnum.active, description: '成员状态' })
});
export type SourceMemberType = z.infer<typeof SourceMemberSchema>;
