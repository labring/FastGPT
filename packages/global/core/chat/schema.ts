import z from 'zod';

/** 会话 ID 在创建、管理、引用和文件等入口统一最多 1024 字符；空值语义由各接口保留。 */
export const ChatIdSchema = z.string().max(1024);
