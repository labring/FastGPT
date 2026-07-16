import { isS3ObjectKey } from '../../utils';
import { ChatS3SourceTypeSchema, type ChatS3SourceType } from './type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

export type ParsedChatFileS3Key = {
  sourceType: ChatS3SourceType;
  sourceId: string;
  uid: string;
  chatId: string;
  filename: string;
  legacyAppKey: boolean;
};

/**
 * 解析聊天文件的 S3 key。
 *
 * 新格式为 `chat/${sourceType}/${sourceId}/${uid}/${chatId}/${filename}`。
 * legacy App 格式 `chat/${appId}/${uid}/${chatId}/${filename}` 继续按原始 key
 * 读取，只在解析结果中归一化为 `sourceType=app` 供鉴权使用。
 */
export function parseChatFileS3Key(key: string): ParsedChatFileS3Key | null {
  if (!isS3ObjectKey(key, 'chat')) return null;

  const [, firstSegment, secondSegment, thirdSegment, fourthSegment, ...filenameParts] =
    key.split('/');
  const sourceTypeResult = ChatS3SourceTypeSchema.safeParse(firstSegment);
  const isSourceAwareKey = sourceTypeResult.success;

  const sourceType = isSourceAwareKey ? sourceTypeResult.data : ChatSourceTypeEnum.app;
  const sourceId = isSourceAwareKey ? secondSegment : firstSegment;
  const uid = isSourceAwareKey ? thirdSegment : secondSegment;
  const chatId = isSourceAwareKey ? fourthSegment : thirdSegment;
  const filename = (isSourceAwareKey ? filenameParts : [fourthSegment, ...filenameParts])
    .filter(Boolean)
    .join('/');

  if (!sourceId || !uid || !chatId || !filename) return null;

  return {
    sourceType,
    sourceId,
    uid,
    chatId,
    filename,
    legacyAppKey: !isSourceAwareKey
  };
}

/**
 * 判断聊天文件 key 是否属于已鉴权的 chat source 与聊天用户。
 */
export function isAuthorizedChatFileS3Key({
  key,
  sourceType,
  sourceId,
  uid,
  chatId
}: {
  key: string;
  sourceType: ChatS3SourceType;
  sourceId: string;
  uid: string;
  chatId?: string;
}) {
  const parsedKey = parseChatFileS3Key(key);

  return (
    isChatFileS3KeyForChat({ key, sourceType, sourceId, chatId }) &&
    !!parsedKey &&
    String(parsedKey.uid) === String(uid)
  );
}

/**
 * 判断聊天文件 key 是否属于指定的 Chat。
 *
 * 该校验不限制 uid，供服务端生成文件在 Chat 保存阶段认领临时 TTL；调用方仍需确保
 * key 来自可信的内部工具元数据。面向用户的文件访问鉴权应继续使用
 * isAuthorizedChatFileS3Key，同时校验 uid。
 */
export function isChatFileS3KeyForChat({
  key,
  sourceType,
  sourceId,
  chatId
}: {
  key: string;
  sourceType: ChatS3SourceType;
  sourceId: string;
  chatId?: string;
}) {
  const parsedKey = parseChatFileS3Key(key);

  return (
    !!parsedKey &&
    parsedKey.sourceType === sourceType &&
    String(parsedKey.sourceId) === String(sourceId) &&
    (chatId === undefined || String(parsedKey.chatId) === String(chatId))
  );
}
