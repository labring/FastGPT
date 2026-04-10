import { z } from 'zod';
import { PaginationSchema } from '../../../api';
import { ObjectIdSchema } from '../../../../common/type/mongo';

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
