import { ObjectIdSchema } from '../../../../common/type/mongo';
import { z } from 'zod';

/* Get App Permission */
export const GetAppPermissionQuerySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type GetAppPermissionQueryType = z.infer<typeof GetAppPermissionQuerySchema>;

export const GetAppPermissionResponseSchema = z.object({
  hasReadPer: z.boolean().meta({
    description: '是否有读权限'
  }),
  hasWritePer: z.boolean().meta({
    description: '是否有写权限'
  }),
  hasManagePer: z.boolean().meta({
    description: '是否有管理权限'
  }),
  hasReadChatLogPer: z.boolean().meta({
    description: '是否有读取对话日志权限'
  }),
  isOwner: z.boolean().meta({
    description: '是否为所有者'
  })
});
export type GetAppPermissionResponseType = z.infer<typeof GetAppPermissionResponseSchema>;
