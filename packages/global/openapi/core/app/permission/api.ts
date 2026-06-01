import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * API: 获取应用权限
 * Route: GET /api/core/app/getPermission
 * Method: GET
 * Description: 根据应用 ID 获取当前用户对该应用的权限信息。
 * Tags: ['权限管理']
 * ============================================================================ */

export const GetAppPermissionQuerySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type GetAppPermissionQueryType = z.infer<typeof GetAppPermissionQuerySchema>;

/* ============================================================================
 * API: 恢复继承权限
 * Route: PUT /api/core/app/resumeInheritPermission
 * Method: PUT
 * Description: 恢复指定应用的继承权限配置。
 * Tags: ['权限管理']
 * ============================================================================ */

export const ResumeInheritPermissionQuerySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type ResumeInheritPermissionQueryType = z.infer<typeof ResumeInheritPermissionQuerySchema>;

export const ResumeInheritPermissionBodySchema = z.object({}).meta({
  description: '恢复继承权限不需要请求体'
});
export type ResumeInheritPermissionBodyType = z.infer<typeof ResumeInheritPermissionBodySchema>;

export const ResumeInheritPermissionResponseSchema = z.undefined().meta({
  description: '恢复成功'
});
export type ResumeInheritPermissionResponseType = z.infer<
  typeof ResumeInheritPermissionResponseSchema
>;
