import z from 'zod';
import { EntityIdSchema } from './types';

export const UserSchema = z.object({
  id: EntityIdSchema,
  status: z.string(),
  username: z.string(),
  password: z.string(),
  promotionRate: z.number(),
  timezone: z.string(),
  language: z.string(),
  tags: z.string().array(),
  createTime: z.date(),
  lastLoginTmbId: EntityIdSchema.nullable()
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({ id: true, createTime: true });
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial();
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
