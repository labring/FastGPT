import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatSourceSchema } from '../schema';

export const ChatPublishSourceSchema = z.object({
  type: ChatSourceSchema.meta({
    description: '最近一次运行的调用渠道类型；无法识别时归为 unknown',
    example: 'api'
  }),
  id: ObjectIdSchema.optional().meta({
    description: '渠道记录的数据库 ID；内部入口及无法恢复引用的历史数据可省略',
    example: '6909d3c4b6a72185d0f08101'
  })
});
export type ChatPublishSourceType = z.infer<typeof ChatPublishSourceSchema>;

export const ChatPublishSourceResponseSchema = ChatPublishSourceSchema.partial().extend({
  name: z
    .string()
    .optional()
    .meta({ description: '当前渠道名称，兼容历史来源名称', example: '客服后端' })
});
export type ChatPublishSourceResponseType = z.infer<typeof ChatPublishSourceResponseSchema>;
