import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';

export const LogItemSchema = z.object({
  _id: z.string().meta({ description: '日志ID' }),
  level: z.number().meta({ description: '日志等级' }),
  text: z.string().meta({ description: '日志内容' }),
  createTime: z.date().meta({ description: '创建时间' })
});

export const GetLogListBodySchema = PaginationSchema.extend({
  search: z.string().optional().meta({ description: '搜索关键词（模糊匹配日志内容）' }),
  logLevel: z
    .array(z.number().describe('日志等级'))
    .optional()
    .meta({ description: '日志等级筛选，默认 [3]（ERROR）' })
});
export const GetLogListResponseSchema = PaginationResponseSchema(LogItemSchema);
