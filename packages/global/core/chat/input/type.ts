import { z } from 'zod';
import { WorkflowBuilderPreviewReplySchema } from '../../workflow/builder/type';

/** 用户提交的结构化交互回复；Ask 保存问题与答案，Preview 保存动作及修改意见，不回写旧 AI。 */
export const UserChatSelectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agentAsk').meta({ description: '问答输入类型' }),
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
  }),
  WorkflowBuilderPreviewReplySchema
]);
export type UserChatSelectType = z.infer<typeof UserChatSelectSchema>;
