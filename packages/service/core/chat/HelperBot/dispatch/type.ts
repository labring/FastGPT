import { z } from 'zod';
import { HelperBotCompletionsParamsSchema } from '../../../../../global/openapi/core/chat/helperBot/api';
import {
  AIChatItemValueItemSchema,
  HelperBotChatItemSchema
} from '@fastgpt/global/core/chat/helperBot/type';
import { WorkflowResponseFnSchema } from '../../../workflow/dispatch/type';
import { LocaleList } from '@fastgpt/global/common/i18n/type';

export const HelperBotDispatchParamsSchema = z.object({
  query: z.string(),
  files: HelperBotCompletionsParamsSchema.shape.files,
  metadata: HelperBotCompletionsParamsSchema.shape.metadata,
  histories: z.array(HelperBotChatItemSchema),
  workflowResponseWrite: WorkflowResponseFnSchema,

  user: z.object({
    teamId: z.string(),
    tmbId: z.string(),
    userId: z.string(),
    isRoot: z.boolean(),
    lang: z.enum(LocaleList)
  })
});
export type HelperBotDispatchParamsType = z.infer<typeof HelperBotDispatchParamsSchema>;

export const HelperBotDispatchResponseSchema = z.object({
  aiResponse: z.array(AIChatItemValueItemSchema),
  usage: z.object({
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number()
  })
});
export type HelperBotDispatchResponseType = z.infer<typeof HelperBotDispatchResponseSchema>;
