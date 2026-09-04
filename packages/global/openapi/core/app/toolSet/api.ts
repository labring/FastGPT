import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { AppTypeEnum } from '../../../../core/app/constants';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { NodeTemplateListItemTypeSchema } from '../../../../core/workflow/type/node';

/**
 * API: 分页获取 MCP/HTTP 工具集下的工具
 * Route: POST /core/app/toolSet/listV2
 */
export const ListToolSetV2BodySchema = z
  .object({
    parentId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: 'MCP 或 HTTP 工具集应用 ID'
    }),
    searchKey: z.string().optional().meta({
      example: 'search',
      description: '工具名称或描述搜索关键词'
    })
  })
  .extend(PaginationSchema.shape);
export type ListToolSetV2BodyType = z.infer<typeof ListToolSetV2BodySchema>;

export const ToolSetListItemSchema = NodeTemplateListItemTypeSchema.extend({
  appType: z.enum([AppTypeEnum.mcpToolSet, AppTypeEnum.httpToolSet]).meta({
    description: '工具集类型'
  })
});

export const ListToolSetV2ResponseSchema = PaginationResponseSchema(ToolSetListItemSchema).meta({
  description: '工具集子工具列表(分页)'
});
export type ListToolSetV2ResponseType = z.infer<typeof ListToolSetV2ResponseSchema>;
