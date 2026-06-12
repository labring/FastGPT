import type { HelperBotTypeEnumType } from '@fastgpt/global/core/chat/helperBot/type';
import { HelperBotTypeEnumSchema } from '@fastgpt/global/core/chat/helperBot/type';
import { isS3ObjectKey } from '../../utils';

/**
 * 解析 HelperBot 文件 key。
 *
 * HelperBot 文件 key 的第一段是固定 source，后续才是 type/user/chat 维度。
 */
export function parseHelperBotFileS3Key(key: string): {
  type: HelperBotTypeEnumType;
  userId: string;
  chatId: string;
  filename: string;
} | null {
  if (!isS3ObjectKey(key, 'helperBot')) return null;

  const [, type, userId, chatId, ...filenameParts] = key.split('/');
  const filename = filenameParts.join('/');
  const parsedType = HelperBotTypeEnumSchema.safeParse(type);

  if (!parsedType.success || !userId || !chatId || !filename) return null;

  return {
    type: parsedType.data,
    userId,
    chatId,
    filename
  };
}

/**
 * 判断 HelperBot 文件 key 是否属于当前用户。
 */
export function isAuthorizedHelperBotFileS3Key({ key, userId }: { key: string; userId: string }) {
  const parsedKey = parseHelperBotFileS3Key(key);

  return !!parsedKey && String(parsedKey.userId) === String(userId);
}
