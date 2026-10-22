import { z } from 'zod';

/** 用户提交的结构化问答输入；问题和显示文字随消息保存，不关联或回写旧 AI。 */
export const UserChatSelectSchema = z.object({
  type: z.enum(['agentAsk', 'workflowBuilderPreview']).meta({ description: '问答输入类型' }),
  questions: z
    .array(
      z.object({
        question: z.string().meta({ description: '提问时的问题快照' }),
        value: z.string().meta({ description: '选项原始值或自定义回答；空字符串表示跳过' }),
        answer: z.string().meta({ description: '回答的展示文字' })
      })
    )
    .min(1)
    .meta({ description: '按题目顺序保存的用户回答' }),
  feedback: z.string().optional().meta({ description: '方案修改的附加反馈' })
});
export type UserChatSelectType = z.infer<typeof UserChatSelectSchema>;
