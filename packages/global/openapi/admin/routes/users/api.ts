import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { UserStatusEnum } from '../../../../support/user/constant';
import { IntSchema } from '../../../../common/zod';
import { UserImportLocaleSchema } from '../../../../support/user/import/type';

export const UserItemSchema = z.object({
  _id: z.string().meta({ description: '用户ID' }),
  username: z.string().meta({ description: '用户名' }),
  contact: z.string().nullish().meta({ description: '联系方式' }),
  avatar: z.string().optional().meta({ description: '用户头像' }),
  status: z.enum(UserStatusEnum).meta({ description: '用户状态' }),
  createTime: z.date().meta({ description: '创建时间' })
});
export type UserItemType = z.infer<typeof UserItemSchema>;

/* ============================================================================
 * API: 获取用户列表
 * Route: POST /admin/routes/users/getUsers
 * Method: POST
 * Description: 分页获取用户列表，支持按用户名搜索
 * Tags: ['Admin', 'Users', 'Read']
 * ============================================================================ */

export const GetUsersBodySchema = PaginationSchema.extend({
  username: z
    .string()
    .trim()
    .max(100)
    .optional()
    .meta({ description: '搜索用户名（支持模糊匹配）' })
});
export type GetUsersBodyType = z.infer<typeof GetUsersBodySchema>;
export const GetUsersResponseSchema = PaginationResponseSchema(UserItemSchema);
export type GetUsersResponseType = z.infer<typeof GetUsersResponseSchema>;

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

export const UserImportTaskStatusSchema = z.enum([
  'queued',
  'validating',
  'writing',
  'completed',
  'completed_with_errors',
  'failed'
]);
export const CreateUserImportBodySchema = z.object({
  locale: UserImportLocaleSchema.default('en').meta({
    description: '导入结果语言',
    example: 'zh-CN'
  })
});
export type CreateUserImportBodyType = z.infer<typeof CreateUserImportBodySchema>;

export const CreateUserImportResponseSchema = z.object({
  taskId: z.string().meta({ description: '导入任务 ID' })
});
export type CreateUserImportResponseType = z.infer<typeof CreateUserImportResponseSchema>;

export const GetUserImportQuerySchema = z.object({
  taskId: z.string().min(1).optional().meta({ description: '导入任务 ID' })
});
export type GetUserImportQueryType = z.infer<typeof GetUserImportQuerySchema>;

export const GetUserImportResponseSchema = z.object({
  taskId: z.string(),
  status: UserImportTaskStatusSchema,
  processedRows: IntSchema,
  totalRows: IntSchema.optional(),
  validRows: IntSchema.optional(),
  successCount: IntSchema,
  failedCount: IntSchema,
  errorFileAvailable: z.boolean().optional(),
  stoppedEarly: z.boolean().optional(),
  taskErrorCode: z.string().optional(),
  taskErrorMessage: z
    .string()
    .optional()
    .meta({ description: '按任务语言翻译的任务级错误，不包含逐行数据', example: '缺少用户名列' })
});
export type GetUserImportResponseType = z.infer<typeof GetUserImportResponseSchema>;

export const UserImportResultQuerySchema = z.object({
  taskId: z.string().min(1).meta({ description: '导入任务 ID' })
});
export type UserImportResultQueryType = z.infer<typeof UserImportResultQuerySchema>;

export const UserImportTemplateQuerySchema = z.object({
  locale: UserImportLocaleSchema.default('en').meta({ description: '模板语言', example: 'zh-CN' })
});
export type UserImportTemplateQueryType = z.infer<typeof UserImportTemplateQuerySchema>;
