import z from 'zod';

/** 聊天只保存生成配置的归档引用，完整表单存入会话所属的 S3 文件。 */
export const ChatAgentBuilderVersionSchema = z.object({
  s3Key: z.string().min(1).meta({
    description: '生成配置的 S3 归档 key',
    example: 'chat/chatAgentHelper/app/member/chat/config.json'
  }),
  expiresAt: z
    .string()
    .datetime()
    .meta({ description: '生成配置的过期时间', example: '2026-10-23T00:00:00.000Z' })
});
export type ChatAgentBuilderVersion = z.infer<typeof ChatAgentBuilderVersionSchema>;
