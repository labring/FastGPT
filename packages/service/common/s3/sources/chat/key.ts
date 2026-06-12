import { isS3ObjectKey } from '../../utils';

/**
 * 解析聊天文件的 S3 key。
 *
 * 聊天文件 key 的授权边界由 appId 与 uid 决定。任何签名或读取前都应先解析
 * 这些路径段并与已鉴权上下文绑定，避免只校验一个无关 app 后签发任意 object key。
 */
export function parseChatFileS3Key(key: string): {
  appId: string;
  uid: string;
  chatId: string;
  filename: string;
} | null {
  if (!isS3ObjectKey(key, 'chat')) return null;

  const [, appId, uid, chatId, ...filenameParts] = key.split('/');
  const filename = filenameParts.join('/');

  if (!appId || !uid || !chatId || !filename) return null;

  return {
    appId,
    uid,
    chatId,
    filename
  };
}

/**
 * 判断聊天文件 key 是否属于已鉴权的 app 与聊天用户。
 */
export function isAuthorizedChatFileS3Key({
  key,
  appId,
  uid
}: {
  key: string;
  appId: string;
  uid: string;
}) {
  const parsedKey = parseChatFileS3Key(key);

  return (
    !!parsedKey &&
    String(parsedKey.appId) === String(appId) &&
    String(parsedKey.uid) === String(uid)
  );
}
