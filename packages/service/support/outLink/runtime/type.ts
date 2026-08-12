import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { OutlinkAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';

export type OutlinkMessage = {
  chatId: string;
  messageId: string;
  chatUserId: string;
  query: UserChatItemValueItemType[];
  resolveQuery?: (options: OutlinkQueryResolveOptions) => Promise<UserChatItemValueItemType[]>;
};

export type OutlinkQueryResolveOptions = {
  maxFileAmount: number;
  maxBytesPerFile: number;
  fileSelectConfig?: AppFileSelectConfigType;
};

export type OutlinkResponseEvent =
  | { type: 'start' }
  | { type: 'chunk'; content: string }
  | { type: 'done'; content: string }
  | { type: 'error'; content: string };

export type OutlinkResponder = {
  (events: AsyncIterable<OutlinkResponseEvent>): Promise<void>;
  /** Maximum time allowed for handling the start event. Defaults to 30 seconds. */
  startTimeoutMs?: number;
};

export type RunOutlinkRuntimeProps<T extends OutlinkAppType> = {
  outLinkConfig: OutLinkSchemaType<T>;
  message: OutlinkMessage;
  respond: OutlinkResponder;
};

export type OutlinkProviderMessageHandler<T extends OutlinkAppType> = (
  context: RunOutlinkRuntimeProps<T>
) => Promise<void>;
