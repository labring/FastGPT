import type { NextApiRequest, NextApiResponse } from 'next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemMiniType
} from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AuxiliaryGenerationChatFileType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { AuxiliaryGenerationStreamContext, AuxiliaryGenerationStreamWriter } from './stream';

export type AuxiliaryGenerationUser = {
  teamId: string;
  tmbId: string;
  userId: string;
  isRoot: boolean;
  lang: localeType;
};

export type AuxiliaryGenerationProcessorParams<T = unknown> = {
  query: string;
  files: AuxiliaryGenerationChatFileType[];
  data: T;
  histories: ChatItemMiniType[];
  streamWriter: AuxiliaryGenerationStreamWriter;
  requestOrigin?: string;
  maxFiles?: number;
  customPdfParse?: boolean;
  checkIsStopping: () => boolean;
  usageSink: (usages: ChatNodeUsageType[]) => void;
  usageId: string;
  user: AuxiliaryGenerationUser;
};

export type AuxiliaryGenerationProcessorResponse = {
  aiResponse: AIChatItemValueItemType[];
  nodeResponses?: ChatHistoryItemResType[];
  memories?: Record<string, any>;
};

export type AuxiliaryGenerationRunParams<T = unknown> = {
  req: NextApiRequest;
  res: NextApiResponse;
  teamId: string;
  tmbId: string;
  userId: string;
  isRoot: boolean;
  lang: localeType;
  appName: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
  query: string;
  files: AuxiliaryGenerationChatFileType[];
  data: T;
  histories: ChatItemMiniType[];
  usageSource: UsageSourceEnum;
  /** 交互续答复用上一轮 usage，避免把一次逻辑调用拆成多条计费记录。 */
  usageId?: string;
  processor: (
    params: AuxiliaryGenerationProcessorParams<T>
  ) => Promise<AuxiliaryGenerationProcessorResponse>;
  maxFiles?: number;
  customPdfParse?: boolean;
  /** SSE 创建后立即暴露给路由层，用于失败时写 error 和 flush resume。 */
  onStreamContextReady?: (streamContext: AuxiliaryGenerationStreamContext) => void;
  /** 公共层写结束事件前的业务收尾，例如持久化本轮聊天。 */
  onBeforeStreamDone?: (params: {
    result: AuxiliaryGenerationProcessorResponse;
    durationSeconds: number;
  }) => Promise<void> | void;
};
