import z from 'zod';
import { PaginationResponseSchema, createPaginationSchema } from '../../api';
import { UserStatusEnum } from '../../../support/user/constant';
import { TeamMemberNameSchema } from '../../../support/user/team/memberName';

export const UserItemSchema = z.object({
  _id: z.string().meta({ description: '用户ID' }),
  username: z.string().meta({ description: '用户名' }),
  contact: z.string().nullish().meta({ description: '联系方式' }),
  avatar: z.string().optional().meta({ description: '用户头像' }),
  status: z.enum(UserStatusEnum).meta({
    description: '用户实际状态；注销仅为管理端按用户名推断的虚拟状态，不改变此字段'
  }),
  createTime: z.date().meta({ description: '创建时间' }),
  isSsoUser: z
    .boolean()
    .meta({ description: '是否为 SSO 用户（SSO 关闭密码时用于禁用密码相关操作）' })
});
export type UserItemType = z.infer<typeof UserItemSchema>;

/* ============================================================================
 * API: 获取用户列表
 * Route: POST /proApi/admin/user/getUsers
 * Method: POST
 * Description: 分页获取用户列表，支持按用户名搜索与活跃、禁用、注销状态过滤
 * Tags: ['Admin', 'Users', 'Read']
 * ============================================================================ */

// cancelled 只用于管理端筛选与展示，不能写入 users.status。
export const AdminUserStatusFilterEnum = z.enum({ ...UserStatusEnum, cancelled: 'cancelled' });
export type AdminUserStatusFilterType = z.infer<typeof AdminUserStatusFilterEnum>;

export const GetUsersBodySchema = createPaginationSchema({
  username: z
    .string()
    .trim()
    .max(100)
    .optional()
    .meta({ description: '搜索用户名（支持模糊匹配）' }),
  statuses: z
    .array(AdminUserStatusFilterEnum)
    .optional()
    .meta({
      description:
        '状态多选过滤：active、forbidden 按实际 status 匹配，可包含注销账号；cancelled 仅按当前或历史匿名用户名格式推断注销。不传或空数组表示不限制状态；管理端默认只查 active',
      example: ['cancelled']
    })
});
export type GetUsersBodyType = z.infer<typeof GetUsersBodySchema>;
export const GetUsersResponseSchema = PaginationResponseSchema(UserItemSchema);
export type GetUsersResponseType = z.infer<typeof GetUsersResponseSchema>;

// addUser
export const AddUserBodySchema = z.object({
  username: z.string().trim().min(1).meta({ description: '用户名' }),
  password: z.string().min(1).meta({ description: '密码' }),
  memberName: TeamMemberNameSchema.optional().meta({ description: '成员名（可选）' })
});
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
export type UpdateUserBodyType = z.infer<typeof UpdateUserBodySchema>;

// delete
export const DeleteUserBodySchema = z.object({
  username: z.string().min(1).meta({ description: '用户名' })
});
export type DeleteUserBodyType = z.infer<typeof DeleteUserBodySchema>;
