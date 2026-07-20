import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { UserStatusEnum } from '../../../../support/user/constant';

export const UserItemSchema = z.object({
  _id: z.string().meta({ description: '用户ID' }),
  username: z.string().meta({ description: '用户名' }),
  avatar: z.string().optional().meta({ description: '用户头像' }),
  status: z.enum(UserStatusEnum).meta({ description: '用户状态' }),
  createTime: z.date().meta({ description: '创建时间' })
});

// getUsers
export const GetUsersBodySchema = PaginationSchema.extend({
  username: z.string().meta({ description: '搜索用户名（支持模糊匹配）' })
});
export type GetUsersBodyType = z.infer<typeof GetUsersBodySchema>;
export const GetUsersResponseSchema = PaginationResponseSchema(UserItemSchema);

// addUser
export const AddUserBodySchema = z.object({
  username: z.string().min(1).meta({ description: '用户名' }),
  password: z.string().min(1).meta({ description: '密码' })
});
export const AddUserResponseSchema = z.object({
  userId: z.string().meta({ description: '新创建的用户ID' }),
  teamId: z.string().meta({ description: '用户的团队ID' })
});

// updateUser
export const UpdateUserBodySchema = z.object({
  _id: z.string().min(1).meta({ description: '用户ID' }),
  username: z.string().min(1).optional().meta({ description: '新用户名' }),
  password: z.string().min(1).optional().meta({ description: '新密码' }),
  status: z.enum(UserStatusEnum).optional().meta({ description: '用户状态' })
});

// delete
export const DeleteUserBodySchema = z.object({
  username: z.string().min(1).meta({ description: '用户名' })
});
