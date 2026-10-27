import { POST } from '@/web/common/api/request';
import {
  ChatAgentConfigLoadBodySchema,
  ChatAgentConfigLoadResponseSchema,
  type ChatAgentConfigLoadBody
} from '@fastgpt/global/openapi/core/chat/chatAgentHelper/config';

/** 按 AI 消息身份读取归档配置，S3 引用只由服务端解析。 */
export const loadChatAgentConfig = async (data: ChatAgentConfigLoadBody) =>
  ChatAgentConfigLoadResponseSchema.parse(
    await POST(
      '/proApi/core/chat/chatAgentHelper/config/load',
      ChatAgentConfigLoadBodySchema.parse(data)
    )
  );
