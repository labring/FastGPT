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

/** 外部身份绑定行状态：disabled 表示该登录入口对该账号已停用，登录直接拒绝。 */
export const UserAccountBindingStatusEnum = {
  active: 'active',
  disabled: 'disabled'
} as const;

export type UserAccountBindingStatus = keyof typeof UserAccountBindingStatusEnum;

/**
 * 内嵌于 User.accounts 的外部身份绑定行（设计 V2 5.3）。
 *
 * (source, externalId) 是登录解析的唯一查找键；matchKey/matchValue 是首绑证据，
 * 只写一次、不参与认证（同步/合并/管理员写入的行可为空）；行由 userId + source 定位，
 * 不设独立主键。一切写入必须走原子操作符 helper，禁止读-改-写裸数组。
 */
export type UserAccountBindingType = {
  source: string;
  externalId: string;
  status: UserAccountBindingStatus;
  /** 首绑实际命中的匹配规则（mobile/email）；非首绑产生的行为空 */
  matchKey?: 'mobile' | 'email';
  /** 首绑实际使用的匹配值（PII，展示需脱敏） */
  matchValue?: string;
  createdAt: Date;
  lastLoginAt?: Date;
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
  /** 外部身份绑定数组；存量账号回填前视为空，读写走统一 helper */
  accounts?: UserAccountBindingType[];
  /** 外部同步来源；设置后同步按来源匹配成员，不再依赖 username 前缀。旧账号无来源时不落该字段 */
  syncSource?: string;
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
