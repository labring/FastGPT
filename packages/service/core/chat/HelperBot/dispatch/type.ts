import { z } from 'zod';
import { HelperBotCompletionsParamsSchema } from '../../../../../global/openapi/core/chat/helperBot/api';
import {
  AIChatItemValueItemSchema,
  HelperBotChatItemSchema
} from '@fastgpt/global/core/chat/helperBot/type';
import { WorkflowResponseFnSchema } from '../../../workflow/dispatch/type';

export const HelperBotDispatchParamsSchema = z.object({
  query: z.string(),
  files: HelperBotCompletionsParamsSchema.shape.files,
  metadata: HelperBotCompletionsParamsSchema.shape.metadata,
  histories: z.array(HelperBotChatItemSchema),
  workflowResponseWrite: WorkflowResponseFnSchema
});
export type HelperBotDispatchParamsType = z.infer<typeof HelperBotDispatchParamsSchema>;

export const HelperBotDispatchResponseSchema = z.object({
  aiResponse: z.array(AIChatItemValueItemSchema)
});
export type HelperBotDispatchResponseType = z.infer<typeof HelperBotDispatchResponseSchema>;
