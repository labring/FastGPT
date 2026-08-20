import z from 'zod';
import { LanguageSchema } from '@fastgpt/global/common/i18n/type';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';
import { EntityIdSchema } from '../../../db/types';

export const UserOpenaiAccountSchema = z.object({
  key: z.string().optional(),
  baseUrl: z.string().optional()
});

export const UserMetaSchema = z.object({
  isActivatedWecomLicense: z.boolean().optional()
});

/** 用户实体是跨数据库对外暴露的稳定形状，不包含 Mongo 文档元数据或密码。 */
export const UserSchema = z.object({
  id: EntityIdSchema,
  status: z.enum(UserStatusEnum),
  username: z.string(),
  passwordUpdateTime: z.date().optional(),
  createTime: z.date(),
  promotionRate: z.number(),
  openaiAccount: UserOpenaiAccountSchema.optional(),
  timezone: z.string(),
  language: LanguageSchema,
  lastLoginTmbId: EntityIdSchema.optional(),
  inviterId: EntityIdSchema.optional(),
  fastgpt_sem: FastGPT_SEM_Schema.optional(),
  phonePrefix: z.number().optional(),
  contact: z.string().optional(),
  tags: z.array(UserTagsSchema),
  meta: UserMetaSchema.optional(),
  avatar: z.string().optional()
});
export type User = z.infer<typeof UserSchema>;
