import z from 'zod';
import { GetPathPropsSchema, ParentIdSchema } from '../../../../common/parentFolder/type';
import { AppTypeEnum } from '../../../../core/app/constants';

/* ============================================================================
 * API: 创建应用文件夹
 * Route: POST /api/core/app/folder/create
 * Method: POST
 * Description: 在根目录或指定父级文件夹下创建应用文件夹或工具文件夹。
 * Tags: ['文件夹管理']
 * ============================================================================ */

export const CreateAppFolderBodySchema = z
  .object({
    parentId: ParentIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '父级文件夹 ID，为空时创建在根目录'
    }),
    name: z.string().min(1).meta({
      example: '默认文件夹',
      description: '文件夹名称'
    }),
    intro: z.string().optional().meta({
      example: '文件夹介绍',
      description: '文件夹介绍'
    }),
    type: z.enum([AppTypeEnum.folder, AppTypeEnum.toolFolder]).meta({
      example: AppTypeEnum.folder,
      description: '文件夹类型'
    })
  })
  .meta({
    example: {
      name: '默认文件夹',
      type: AppTypeEnum.folder
    }
  });
export type CreateAppFolderBodyType = z.infer<typeof CreateAppFolderBodySchema>;

export const CreateAppFolderResponseSchema = z.undefined().meta({
  description: '创建成功'
});
export type CreateAppFolderResponseType = z.infer<typeof CreateAppFolderResponseSchema>;

/* ============================================================================
 * API: 获取应用文件夹路径
 * Route: GET /api/core/app/folder/path
 * Method: GET
 * Description: 获取指定应用或文件夹的父级路径。
 * Tags: ['文件夹管理']
 * ============================================================================ */

export const GetAppFolderPathQuerySchema = GetPathPropsSchema.extend({
  sourceId: ParentIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '目标应用或文件夹 ID，为空时返回根路径'
  }),
  type: z.enum(['current', 'parent']).optional().meta({
    example: 'current',
    description: '路径查询方式：current 返回当前节点路径，parent 返回父级路径'
  })
}).meta({
  example: {
    sourceId: '68ad85a7463006c963799a05',
    type: 'current'
  }
});
export type GetAppFolderPathQueryType = z.infer<typeof GetAppFolderPathQuerySchema>;

const AppFolderPathItemSchema = z
  .object({
    parentId: ParentIdSchema.meta({
      description: '路径节点 ID；根目录节点为空'
    }),
    parentName: z.string().meta({
      example: '默认文件夹',
      description: '路径节点名称'
    })
  })
  .meta({
    description: '应用文件夹路径节点'
  });

export const GetAppFolderPathResponseSchema = z.array(AppFolderPathItemSchema).meta({
  description: '应用文件夹路径'
});
export type GetAppFolderPathResponseType = z.infer<typeof GetAppFolderPathResponseSchema>;
