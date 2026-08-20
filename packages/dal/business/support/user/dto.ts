import z from 'zod';
import { EntityIdSchema } from '../../../db/types';
import { UserSchema } from './entity';

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
