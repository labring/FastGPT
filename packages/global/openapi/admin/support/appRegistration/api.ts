import z from 'zod';
import { EntityIdStringSchema } from '../../../../common/string/entityId';

/* ============================================================================
 * API: 创建应用备案记录
 * Route: POST /api/admin/support/appRegistration/create
 * Method: POST
 * Description: 系统超级管理员为指定应用创建备案记录，校验团队备案配额并防止重复备案
 * Tags: ['Admin', 'Apps', 'Write']
 * ============================================================================ */

export const CreateAppRegistrationBodySchema = z
  .object({
    appId: EntityIdStringSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '需要备案的应用 ID'
    })
  })
  .meta({
    example: {
      appId: '68ad85a7463006c963799a05'
    }
  });
export type CreateAppRegistrationBody = z.infer<typeof CreateAppRegistrationBodySchema>;

export const CreateAppRegistrationResponseSchema = z.object({
  success: z.boolean().meta({
    example: true,
    description: '是否成功创建备案记录'
  })
});
export type CreateAppRegistrationResponse = z.infer<typeof CreateAppRegistrationResponseSchema>;
