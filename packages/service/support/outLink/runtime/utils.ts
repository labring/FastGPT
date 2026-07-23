import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { OutlinkAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { appendRedisCache } from '../../../common/redis/cache';
import { getLogger, LogCategories } from '../../../common/logger';
import { runOutlinkRuntime } from './service';

const logger = getLogger(LogCategories.MODULE.OUTLINK);

export type outLinkInvokeChatProps<T extends OutlinkAppType> = {
  outLinkConfig: OutLinkSchemaType<T>;
  chatId: string;
  query: UserChatItemValueItemType[];
  messageId: string;
  chatUserId: string;
  onReply?: (replyContent: string) => Promise<void>;
  onStreamChunk?: (text: string) => Promise<void>;
  streamId?: string;
};

export const STREAM_END_FLAG = '[DONE]';
export const STREAM_CACHE_KEY_PREFIX = 'streamResponse:';

/** Adapts legacy callback and Redis delivery to the shared runtime response stream.
 *
 * @deprecated Use `runOutlinkRuntime` with a provider adapter.
 * Remove this function after all providers migrate to the new runtime.
 */
export async function outlinkInvokeChat<T extends OutlinkAppType>({
  outLinkConfig,
  chatId,
  query,
  messageId,
  chatUserId,
  onReply,
  onStreamChunk,
  streamId
}: outLinkInvokeChatProps<T>) {
  const streamResKey = `${STREAM_CACHE_KEY_PREFIX}${streamId}`;

  return runOutlinkRuntime({
    outLinkConfig,
    message: { chatId, query, messageId, chatUserId },
    respond: async (events) => {
      let started = false;

      for await (const event of events) {
        if (event.type === 'start') {
          started = true;
          if (streamId) await appendRedisCache(streamResKey, '', 120);
          continue;
        }

        if (event.type === 'chunk') {
          try {
            if (streamId) await appendRedisCache(streamResKey, event.content, 60);
            await onStreamChunk?.(event.content);
          } catch (error) {
            logger.error('Outlink real-time streaming failed', {
              streamId,
              messageId,
              error
            });
          }
          continue;
        }

        if (event.type === 'done') {
          if (!started) {
            await onReply?.(event.content);
            if (streamId) {
              await appendRedisCache(streamResKey, event.content, 60);
              await appendRedisCache(streamResKey, STREAM_END_FLAG, 60);
            }
          } else if (streamId) {
            await appendRedisCache(streamResKey, STREAM_END_FLAG, 60);
          } else {
            await onReply?.(event.content);
          }
          continue;
        }

        if (streamId) await appendRedisCache(streamResKey, STREAM_END_FLAG, 60);
        await onReply?.(event.content);
      }
    }
  });
}
