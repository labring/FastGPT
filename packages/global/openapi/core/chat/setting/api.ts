import type z from 'zod';
import { ChatSettingModelSchema } from '../../../../core/chat/setting/type';

/** POST /proApi/core/chat/setting/update 的可更新门户配置。 */
export const UpdateChatSettingBodySchema = ChatSettingModelSchema.partial();
export type UpdateChatSettingBody = z.infer<typeof UpdateChatSettingBodySchema>;
