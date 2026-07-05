import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ChatFileTypeEnum } from '../../../../core/chat/constants';
import { HelperBotTypeEnum } from '../../../../core/chat/helperBot/type';
import { topAgentParamsSchema } from '../../../../core/chat/helperBot/topAgent/type';
import { ChatCompletionMessageParamSchema } from '../../../../core/ai/llm/type';
import { WorkflowInteractiveResponseTypeSchema } from '../../../../core/workflow/template/system/interactive/type';

export const HelperBotChatFileSchema = z.object({
  type: z.enum(ChatFileTypeEnum),
  key: z.string(),
  url: z.string().optional(),
  name: z.string()
});
export type HelperBotChatFileType = z.infer<typeof HelperBotChatFileSchema>;

export const HelperBotCompletionsParamsSchema = z
  .object({
    chatId: z.string(),
    responseChatItemId: z.string(),
    appId: ObjectIdSchema,
    messages: z.array(ChatCompletionMessageParamSchema),
    interactive: WorkflowInteractiveResponseTypeSchema.optional(),
    metadata: z.object({
      type: z.literal(HelperBotTypeEnum.topAgent),
      data: topAgentParamsSchema
    })
  })
  .superRefine(({ messages }, ctx) => {
    const lastUserMessage = messages.findLast((message) => message.role === 'user');

    if (!lastUserMessage?.dataId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messages'],
        message: 'HelperBot messages requires a user message with dataId'
      });
    }
  });
export type HelperBotCompletionsParamsType = z.infer<typeof HelperBotCompletionsParamsSchema>;
