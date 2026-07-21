import { axios } from '../../common/api/axios';
import { MongoOutLink } from './schema';
import { FastGPTProUrl } from '../../common/system/constants';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getLogger, LogCategories } from '../../common/logger';
import { Readable } from 'node:stream';

const logger = getLogger(LogCategories.MODULE.OUTLINK.TOOLS);

/**
 * Indicates an outlink file download stream exceeds the size limit.
 * Stream.Readable.destroy needs this Error.
 */
export class OutLinkFileSizeExceededError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`OutLink file exceeds maximum allowed size (${maxBytes} bytes)`);
    this.name = 'OutLinkFileSizeExceededError';
    this.maxBytes = maxBytes;
  }
}

/**
 * 将外部渠道下载流包装为带实际字节限制的 Readable。
 * 调用方负责设置平台上限、超时和用户提示；下游停止消费时会同步销毁源流。
 */
export const createOutLinkFileLimitStream = ({
  source,
  maxBytes
}: {
  source: Readable;
  maxBytes: number;
}) => {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes must be a finite positive number');
  }

  return Readable.from(
    (async function* () {
      let totalBytes = 0;

      try {
        for await (const chunk of source) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;

          if (totalBytes > maxBytes) {
            const error = new OutLinkFileSizeExceededError(maxBytes);
            source.destroy(error);
            throw error;
          }

          yield chunk;
        }
      } finally {
        if (!source.destroyed) {
          source.destroy();
        }
      }
    })(),
    { objectMode: false }
  );
};

export const addOutLinkUsage = ({
  shareId,
  totalPoints
}: {
  shareId: string;
  totalPoints: number;
}) => {
  return MongoOutLink.findOneAndUpdate(
    { shareId },
    {
      $inc: { usagePoints: totalPoints },
      lastTime: new Date()
    }
  ).catch((err) => {
    logger.error('Failed to update outlink usage', { shareId, error: err });
  });
};

export const pushResult2Remote = async ({
  shareId,
  chatId,
  outLinkUid,
  appName,
  flowResponses
}: {
  shareId: string;
  chatId: string;
  outLinkUid?: string; // raw id, not parse
  appName: string;
  flowResponses?: ChatHistoryItemResType[];
}) => {
  if (!shareId || !outLinkUid || !FastGPTProUrl) return;
  try {
    const outLink = await MongoOutLink.findOne({
      shareId
    });
    if (!outLink?.limit?.hookUrl) return;

    axios({
      method: 'post',
      baseURL: outLink.limit.hookUrl,
      url: '/shareAuth/finish',
      data: {
        token: outLinkUid,
        appName,
        responseData: flowResponses,
        chatId
      }
    });
  } catch (error) {
    logger.error('Failed to push outlink result to remote hook', { shareId, error });
  }
};
