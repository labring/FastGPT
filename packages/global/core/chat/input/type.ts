import { z } from 'zod';

/** 用户提交的结构化问答输入；问题和回答随消息保存，不关联或回写旧 AI。 */
export const UserChatSelectSchema = z.object({
  type: z.enum(['agentAsk', 'workflowBuilderPreview']).meta({ description: '问答输入类型' }),
  questions: z
    .array(
      z.object({
        question: z.string().meta({ description: '提问时的问题快照' }),
        value: z
          .string()
          .meta({ description: '用户回答内容：选项文本或自定义回答；空字符串表示跳过' })
      })
    )
    .min(1)
    .meta({ description: '按题目顺序保存的用户回答' })
});
export type UserChatSelectType = z.infer<typeof UserChatSelectSchema>;
