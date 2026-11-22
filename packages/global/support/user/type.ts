import { AccountCancellationSummarySchema } from './account/cancellation/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';
import { LanguageSchema, type LangEnum } from '../../common/i18n/type';
import { TeamPermission } from '../permission/user/controller';
import { UserStatusEnum } from './constant';
import { TeamMemberStatusEnum } from './team/constant';
import { TeamTmbItemSchema } from './team/type';
import type { FastGPTSemType } from '../marketing/type';

export const UserTagsSchema = z.enum(['wecom']);
export const UserTagsEnum = UserTagsSchema.enum;
export type UserTagsType = z.infer<typeof UserTagsSchema>;

export type UserMetaType = {
  isActivatedWecomLicense?: boolean;
};

/** 系统保留的同步管理标记来源：外部输入（同步协议/SSO 登录/管理端绑定）禁止使用 */
export const SYSTEM_SYNC_ACCOUNT_SOURCE = 'system-sync';

/** 外部身份绑定行（V3 极简模型）：(source, id) 全局唯一，登录点查与同步圈人共用 */
export type UserAccountItem = {
  source: string;
  id: string;
  status: 'active' | 'disabled';
};

export type UserModelSchema = {
  _id: string;
  username: string;
  password?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
  language: `${LangEnum}`;
  status: UserStatusEnum;
  lastLoginTmbId?: string;
  passwordUpdateTime?: Date;
  fastgpt_sem?: FastGPTSemType;
  contact?: string | null;
  tags: UserTagsType[];
  meta?: UserMetaType;
  accounts?: UserAccountItem[];
};

export const UserSchema = z.object({
  _id: ObjectIdSchema,
  username: z.string(),
  avatar: z.string().nullish(),
  timezone: z.string(),
  language: LanguageSchema.optional(),
  accountCancellation: AccountCancellationSummarySchema.optional(),
  team: TeamTmbItemSchema,
  permission: z.instanceof(TeamPermission),
  contact: z.string().nullish(),
  tags: z.array(UserTagsSchema).optional(),
  hasPassword: z.boolean(),
  passwordAvailable: z.boolean().optional(),
  status: z.enum(UserStatusEnum).meta({ description: '账号状态' })
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
      corpId: z.string(),
      licenseCapacity: z.int().min(0).default(0)
    })
    .optional()
});

export type TeamMetaType = z.infer<typeof TeamMetaSchema>;
