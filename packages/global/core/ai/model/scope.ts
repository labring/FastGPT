import z from 'zod';

/** 模型与 AI Proxy 渠道共同使用的资源作用域。 */
export const ChannelTypeSchema = z.enum(['system', 'team']);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;
