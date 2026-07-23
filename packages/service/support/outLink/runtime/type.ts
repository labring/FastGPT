import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { OutlinkAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';

export type OutlinkMessage = {
  chatId: string;
  messageId: string;
  chatUserId: string;
  query: UserChatItemValueItemType[];
};

export type OutlinkResponseEvent =
  | { type: 'start' }
  | { type: 'chunk'; content: string }
  | { type: 'done'; content: string }
  | { type: 'error'; content: string };

export type OutlinkResponder = (events: AsyncIterable<OutlinkResponseEvent>) => Promise<void>;

export type RunOutlinkRuntimeProps<T extends OutlinkAppType> = {
  outLinkConfig: OutLinkSchemaType<T>;
  message: OutlinkMessage;
  respond: OutlinkResponder;
};

export type OutlinkProviderMessageHandler<T extends OutlinkAppType> = (
  context: RunOutlinkRuntimeProps<T>
) => Promise<void>;
