import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { OutlinkAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { appendRedisCache } from '../../../common/redis/cache';
import { runOutlinkRuntime } from './service';

export type outLinkInvokeChatProps<T extends OutlinkAppType> = {
  outLinkConfig: OutLinkSchemaType<T>;
  chatId: string;
  query: UserChatItemValueItemType[];
  messageId: string;
  chatUserId: string;
  onReply?: (replyContent: string) => Promise<void>;
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
  streamId
}: outLinkInvokeChatProps<T>) {
  const streamResKey = `${STREAM_CACHE_KEY_PREFIX}${streamId}`;

  return runOutlinkRuntime({
    outLinkConfig,
    message: { chatId, query, messageId, chatUserId },
    respond: async (events) => {
      for await (const event of events) {
        if (event.type === 'start') {
          if (streamId) await appendRedisCache(streamResKey, '', 120);
          continue;
        }

        if (event.type === 'chunk') continue;

        if (streamId) {
          await appendRedisCache(streamResKey, `${event.content}${STREAM_END_FLAG}`, 60);
        } else {
          await onReply?.(event.content);
        }
      }
    }
  });
}
