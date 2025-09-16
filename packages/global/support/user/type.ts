import type { TeamPermission } from '../permission/user/controller';
import type { UserStatusEnum } from './constant';
import type { TeamMemberStatusEnum } from './team/constant';
import type { TeamTmbItemType } from './team/type';
import { z } from '../../common/tsRest/z';
import { ObjectIdSchema } from '../../common/type/utils';
import { TeamMemberStatusSchema } from './team/type';

export const SourceMemberSchema = z
  .object({
    name: z.string().openapi({ example: 'root' }).describe('用户名称'),
    avatar: z.string().optional().openapi({ example: '' }).describe('用户头像 URL'),
    status: TeamMemberStatusSchema.openapi({ example: 'active' }).describe('团队成员状态')
  })
  .describe('用户成员信息');
export type SourceMemberType = z.infer<typeof SourceMemberSchema>;

export type UserModelSchema = {
  _id: string;
  username: string;
  password: string;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
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
  promotionRate: UserModelSchema['promotionRate'];
  team: TeamTmbItemType;
  notificationAccount?: string;
  permission: TeamPermission;
  contact?: string;
};
