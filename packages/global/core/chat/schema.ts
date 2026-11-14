import z from 'zod';
import { ChatSourceEnum } from './constants';

/** 历史渠道名称、缺失值及未知来源类型统一归为 unknown；不用于资源类型或权限校验。 */
export const ChatSourceSchema = z.enum(ChatSourceEnum).catch(ChatSourceEnum.unknown);

/** 会话 ID 在创建、管理、引用和文件等入口统一最多 1024 字符；空值语义由各接口保留。 */
export const ChatIdSchema = z.string().max(1024);
