import type { ClientSession } from '@fastgpt/service/common/mongo';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { buildChatSourceQuery, type ChatSourceParams } from '@fastgpt/service/core/chat/source';
import type { PrepareDraftFilesResponse } from '@fastgpt/global/openapi/core/chat/file/api';

/**
 * 准备已经鉴权的草稿文件；只续期仍有效的普通对象 TTL，不复活过期引用或创建新 TTL。
 * 使用数据库当前时间原子判断，避免 metadata 请求耗时跨过到期边界；持久化文件必须能在本会话记录中证明。
 */
export const prepareAuthorizedDraftFiles = async (
  {
    sourceType,
    sourceId,
    chatId,
    keys,
    remainingMs
  }: ChatSourceParams & { chatId: string; keys: string[]; remainingMs: number },
  session?: ClientSession
): Promise<PrepareDraftFilesResponse> => {
  const bucket = getS3ChatSource();
  return Promise.all(
    [...new Set(keys)].map(async (key) => {
      const metadata = await bucket.getFileMetadata(key).catch((error) => {
        if (error === CommonErrEnum.fileNotFound) return undefined;
        throw error;
      });
      if (!metadata) return { key, status: 'unavailable' as const, reason: 'missing' as const };

      const ttl = await MongoS3TTL.findOneAndUpdate(
        {
          bucketName: bucket.bucketName,
          minioKey: key,
          multipart: { $exists: false },
          $expr: { $gt: ['$expiredTime', '$$NOW'] }
        },
        [
          {
            $set: { expiredTime: { $max: ['$expiredTime', { $add: ['$$NOW', remainingMs] }] } }
          }
        ],
        { new: true, session }
      ).lean();

      if (!ttl) {
        const temporary = await MongoS3TTL.exists({
          bucketName: bucket.bucketName,
          minioKey: key
        }).session(session ?? null);
        if (temporary) return { key, status: 'unavailable' as const, reason: 'expired' as const };
        const persisted = await MongoChatItem.exists({
          ...buildChatSourceQuery({ sourceType, sourceId }),
          chatId,
          deleteTime: null,
          'value.file.key': key
        }).session(session ?? null);
        if (!persisted) return { key, status: 'unavailable' as const, reason: 'expired' as const };
      }

      const { url } = await bucket.createGetChatFileURL({ key, external: true });
      return { key, status: 'ready' as const, url, expiresAt: ttl?.expiredTime.getTime() ?? null };
    })
  );
};
