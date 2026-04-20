import { z } from 'zod';
import { PaginationSchema } from '../../../api';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';

/* ============================================================================
 * API: 获取对话输入引导列表
 * Route: POST /api/core/chat/inputGuide/list
 * Method: POST
 * Description: 获取指定应用的对话输入引导列表，支持关键词搜索
 * Tags: ['Chat', 'InputGuide', 'Read']
 * ============================================================================ */

export const ChatInputGuideListBodySchema = PaginationSchema.extend({
  appId: ObjectIdSchema.describe('应用 ID'),
  searchKey: z.string().max(200).optional().default('').meta({
    example: '如何使用',
    description: '搜索关键词，用于模糊匹配引导文本'
  })
});
export type ChatInputGuideListBodyType = z.infer<typeof ChatInputGuideListBodySchema>;

export const ChatInputGuideItemSchema = z.object({
  _id: z.coerce.string().meta({ example: '68ad85a7463006c963799a05', description: '引导 ID' }),
  appId: z.coerce.string().meta({ example: '68ad85a7463006c963799a06', description: '应用 ID' }),
  text: z.string().meta({ example: '如何开始使用？', description: '引导文本' })
});

export const ChatInputGuideListResponseSchema = z.object({
  list: z.array(ChatInputGuideItemSchema).meta({ description: '引导列表' }),
  total: z.number().meta({ example: 10, description: '总数' })
});
export type ChatInputGuideListResponseType = z.infer<typeof ChatInputGuideListResponseSchema>;

/* ============================================================================
 * API: 统计对话输入引导总数
 * Route: GET /api/core/chat/inputGuide/countTotal
 * Method: GET
 * Description: 获取指定应用的对话输入引导总数
 * Tags: ['Chat', 'InputGuide', 'Read']
 * ============================================================================ */

export const CountChatInputGuideTotalQuerySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' })
});
export type CountChatInputGuideTotalQueryType = z.infer<typeof CountChatInputGuideTotalQuerySchema>;

export const CountChatInputGuideTotalResponseSchema = z.object({
  total: z.number().int().nonnegative().meta({ example: 10, description: '总数' })
});
export type CountChatInputGuideTotalResponseType = z.infer<
  typeof CountChatInputGuideTotalResponseSchema
>;

/* ============================================================================
 * API: 创建对话输入引导
 * Route: POST /api/core/chat/inputGuide/create
 * Method: POST
 * Description: 批量创建对话输入引导文本
 * Tags: ['Chat', 'InputGuide', 'Write']
 * ============================================================================ */

export const CreateChatInputGuideBodySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  textList: z
    .array(z.string())
    .min(1)
    .meta({ example: ['如何开始使用？', '有哪些功能？'], description: '引导文本列表' })
});
export type CreateChatInputGuideBodyType = z.infer<typeof CreateChatInputGuideBodySchema>;

export const CreateChatInputGuideResponseSchema = z.object({
  insertLength: z
    .number()
    .int()
    .nonnegative()
    .meta({ example: 2, description: '实际插入成功的数量' })
});
export type CreateChatInputGuideResponseType = z.infer<typeof CreateChatInputGuideResponseSchema>;

/* ============================================================================
 * API: 删除对话输入引导
 * Route: DELETE /api/core/chat/inputGuide/delete
 * Method: DELETE
 * Description: 批量删除指定的对话输入引导
 * Tags: ['Chat', 'InputGuide', 'Delete']
 * ============================================================================ */

export const DeleteChatInputGuideBodySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  dataIdList: z
    .array(z.string())
    .min(1)
    .meta({
      example: ['68ad85a7463006c963799a05', '68ad85a7463006c963799a06'],
      description: '要删除的引导 ID 列表'
    })
});
export type DeleteChatInputGuideBodyType = z.infer<typeof DeleteChatInputGuideBodySchema>;

export const DeleteChatInputGuideResponseSchema = z.object({});
export type DeleteChatInputGuideResponseType = z.infer<typeof DeleteChatInputGuideResponseSchema>;

/* ============================================================================
 * API: 删除应用所有对话输入引导
 * Route: DELETE /api/core/chat/inputGuide/deleteAll
 * Method: DELETE
 * Description: 删除指定应用的所有对话输入引导
 * Tags: ['Chat', 'InputGuide', 'Delete']
 * ============================================================================ */

export const DeleteAllChatInputGuideBodySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' })
});
export type DeleteAllChatInputGuideBodyType = z.infer<typeof DeleteAllChatInputGuideBodySchema>;

export const DeleteAllChatInputGuideResponseSchema = z.object({});
export type DeleteAllChatInputGuideResponseType = z.infer<
  typeof DeleteAllChatInputGuideResponseSchema
>;

/* ============================================================================
 * API: 查询对话输入引导（公开接口）
 * Route: POST /api/core/chat/inputGuide/query
 * Method: POST
 * Description: 根据搜索词查询对话输入引导，支持分享链接和团队 Token 鉴权
 * Tags: ['Chat', 'InputGuide', 'Read']
 * ============================================================================ */

export const QueryChatInputGuideBodySchema = OutLinkChatAuthSchema.extend({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  searchKey: z.string().meta({ example: '如何使用', description: '搜索关键词' })
});
export type QueryChatInputGuideBodyType = z.infer<typeof QueryChatInputGuideBodySchema>;

export const QueryChatInputGuideResponseSchema = z.array(
  z.string().meta({ example: '如何开始使用？', description: '引导文本' })
);
export type QueryChatInputGuideResponseType = z.infer<typeof QueryChatInputGuideResponseSchema>;

/* ============================================================================
 * API: 更新对话输入引导
 * Route: PUT /api/core/chat/inputGuide/update
 * Method: PUT
 * Description: 更新指定的对话输入引导文本
 * Tags: ['Chat', 'InputGuide', 'Write']
 * ============================================================================ */

export const UpdateChatInputGuideBodySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  dataId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '要更新的引导 ID' }),
  text: z.string().min(1).meta({ example: '如何开始使用？', description: '新的引导文本' })
});
export type UpdateChatInputGuideBodyType = z.infer<typeof UpdateChatInputGuideBodySchema>;

export const UpdateChatInputGuideResponseSchema = z.object({});
export type UpdateChatInputGuideResponseType = z.infer<typeof UpdateChatInputGuideResponseSchema>;
