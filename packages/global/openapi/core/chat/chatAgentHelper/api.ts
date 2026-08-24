import z from 'zod';

export {
  AuxiliaryGenerationChatFileSchema as ChatAgentHelperChatFileSchema,
  ChatAgentHelperCompletionsParamsSchema,
  type AuxiliaryGenerationChatFileType as ChatAgentHelperChatFileType,
  type ChatAgentHelperCompletionsParamsType
} from '../../../../core/ai/auxiliaryGeneration/type';

/** POST /proApi/core/chat/chatAgentHelper/completions 的 SSE 响应契约。 */
export const ChatAgentHelperSseResponseSchema = z.string().meta({
  example: 'event: answer\ndata: {"choices":[...]}\n\n',
  description:
    'Chat Agent 辅助生成 SSE 事件流，包含 answer、interactive、config 或 error 等事件，并以 [DONE] 结束'
});
export type ChatAgentHelperSseResponse = z.infer<typeof ChatAgentHelperSseResponseSchema>;
