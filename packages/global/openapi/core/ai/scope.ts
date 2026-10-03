import z from 'zod';

/** 模型与渠道共同使用的资源作用域。 */
export const AIScopeSchema = z.enum(['system', 'team']);
export type AIScope = z.infer<typeof AIScopeSchema>;
