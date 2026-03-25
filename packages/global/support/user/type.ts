import z from 'zod';
import { LanguageSchema, type LangEnum } from '../../common/i18n/type';
import { TeamPermission } from '../permission/user/controller';
import type { UserStatusEnum } from './constant';
import { TeamMemberStatusEnum } from './team/constant';
import { TeamTmbItemSchema } from './team/type';

export const UserTagsEnum = z.enum(['wecom']);
export type UserTagsEnum = z.infer<typeof UserTagsEnum>;

export type UserMetaType = {
  isActivatedWecomLicense?: boolean;
};

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
  tags: UserTagsEnum[];
  meta?: UserMetaType;
};

export const UserSchema = z.object({
  _id: z.string(),
  username: z.string(),
  avatar: z.string(),
  timezone: z.string(),
  language: LanguageSchema.optional(),
  promotionRate: z.number(),
  team: TeamTmbItemSchema,
  permission: z.instanceof(TeamPermission),
  contact: z.string().optional(),
  tags: z.array(UserTagsEnum).optional()
});
export type UserType = z.infer<typeof UserSchema>;

export const SourceMemberSchema = z.object({
  name: z.string().meta({ example: '张三', description: '成员名称' }),
  avatar: z.string().nullish().meta({ description: '成员头像' }),
  status: z
    .enum(TeamMemberStatusEnum)
    .meta({ example: TeamMemberStatusEnum.active, description: '成员状态' })
});
export type SourceMemberType = z.infer<typeof SourceMemberSchema>;

export const TeamMetaSchema = z.object({
  wecom: z
    .object({
      permanentCode: z.string(),
      corpId: z.string()
    })
    .optional()
});

export type TeamMetaType = z.infer<typeof TeamMetaSchema>;
