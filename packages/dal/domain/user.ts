import z from 'zod';
import { LanguageSchema } from '@fastgpt/global/common/i18n/type';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';
import { EntityIdSchema } from './types';

export const UserOpenaiAccountSchema = z.object({
  key: z.string().optional(),
  baseUrl: z.string().optional()
});

export const UserMetaSchema = z.object({
  isActivatedWecomLicense: z.boolean().optional()
});

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

export const CreateUserSchema = UserSchema.omit({ id: true, createTime: true })
  .partial()
  .extend({
    username: z.string().min(1),
    password: z.string().min(1)
  });
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial().omit({ username: true });
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const UserCredentialsSchema = z.union([
  z
    .object({
      username: z.string().min(1),
      password: z.string().min(1)
    })
    .strict(),
  z
    .object({
      id: EntityIdSchema,
      password: z.string().min(1)
    })
    .strict()
]);
export type UserCredentials = z.infer<typeof UserCredentialsSchema>;
