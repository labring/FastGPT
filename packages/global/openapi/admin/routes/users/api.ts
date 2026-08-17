import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { UserStatusEnum } from '../../../../support/user/constant';

export const UserItemSchema = z.object({
  _id: z.string().meta({ description: '用户ID' }),
  username: z.string().meta({ description: '用户名' }),
  contact: z.string().optional().meta({ description: '联系方式' }),
  status: z.enum(UserStatusEnum).meta({ description: '用户状态' }),
  // 统一以毫秒时间戳返回，便于前端 dayjs 直接格式化
  createTime: z.number().meta({ description: '创建时间（毫秒时间戳）' }),
  isSsoUser: z
    .boolean()
    .meta({ description: '是否为 SSO 用户（SSO 关闭密码时用于禁用密码相关操作）' })
});
export type UserItemType = z.infer<typeof UserItemSchema>;

// getUsers
export const GetUsersBodySchema = PaginationSchema.extend({
  // 可选：省略时返回全部用户；空字符串正则等价于全匹配
  username: z
    .string()
    .optional()
    .meta({ description: '搜索用户名（支持模糊匹配，省略则返回全部）' })
});
export type GetUsersBodyType = z.infer<typeof GetUsersBodySchema>;
export const GetUsersResponseSchema = PaginationResponseSchema(UserItemSchema);
export type GetUsersResponseType = z.infer<typeof GetUsersResponseSchema>;

// addUser
export const AddUserBodySchema = z
  .object({
    username: z.string().trim().min(1).meta({ description: '用户名' }),
    password: z.string().min(1).meta({ description: '密码' })
  })
  .strict();
export type AddUserBodyType = z.infer<typeof AddUserBodySchema>;
export const AddUserResponseSchema = z.object({
  userId: z.string().meta({ description: '新创建的用户ID' }),
  teamId: z.string().meta({ description: '用户的团队ID' })
});
export type AddUserResponseType = z.infer<typeof AddUserResponseSchema>;

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
