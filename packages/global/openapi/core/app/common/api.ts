import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { AppTypeEnum } from '../../../../core/app/constants';
import { AppChatConfigTypeSchema } from '../../../../core/app/type';
import { StoreEdgeItemTypeSchema } from '../../../../core/workflow/type/edge';
import { StoreNodeItemTypeSchema } from '../../../../core/workflow/type/node';
import { ShortUrlSchema } from '../../../../support/marketing/type';
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

/* Create app */
export const CreateAppBodySchema = z
  .object({
    parentId: ParentIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '父级应用/文件夹 ID'
    }),
    name: z.string().min(1).meta({
      example: '新应用',
      description: '应用名称'
    }),
    avatar: z.string().optional().meta({
      example: 'https://example.com/avatar.png',
      description: '应用头像'
    }),
    intro: z.string().optional().meta({
      example: '应用介绍',
      description: '应用介绍'
    }),
    type: z.enum(AppTypeEnum).meta({
      example: AppTypeEnum.workflow,
      description: '应用类型'
    }),
    modules: z.array(StoreNodeItemTypeSchema).meta({
      example: [],
      description: '应用节点配置'
    }),
    edges: z.array(StoreEdgeItemTypeSchema).optional().meta({
      example: [],
      description: '应用连线'
    }),
    chatConfig: AppChatConfigTypeSchema.optional().meta({
      description: '聊天配置'
    }),
    templateId: z.string().optional().meta({
      example: 'template-123',
      description: '模板 ID'
    }),
    utmParams: ShortUrlSchema.optional().meta({
      description: 'UTM 参数'
    })
  })
  .meta({
    example: {
      name: '新应用',
      type: AppTypeEnum.simple,
      modules: [],
      edges: [],
      parentId: '68ad85a7463006c963799a05'
    }
  });
export type CreateAppBodyType = z.infer<typeof CreateAppBodySchema>;

export const CreateAppResponseSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '应用 ID'
});
export type CreateAppResponseType = z.infer<typeof CreateAppResponseSchema>;
