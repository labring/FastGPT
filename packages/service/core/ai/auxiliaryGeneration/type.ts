import type { NextApiRequest, NextApiResponse } from 'next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType, ChatItemDBSchemaType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AuxiliaryGenerationChatFileType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { AuxiliaryGenerationStreamWriter } from './stream';

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
  histories: ChatItemDBSchemaType[];
  streamWriter?: AuxiliaryGenerationStreamWriter;
  requestOrigin?: string;
  maxFiles?: number;
  customPdfParse?: boolean;
  checkIsStopping?: () => boolean;
  usageSink?: (usages: ChatNodeUsageType[]) => void;
  user: AuxiliaryGenerationUser;
};

export type AuxiliaryGenerationProcessorResponse = {
  aiResponse: AIChatItemValueItemType[];
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
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
  histories: ChatItemDBSchemaType[];
  usageSource: UsageSourceEnum;
  processor: (
    params: AuxiliaryGenerationProcessorParams<T>
  ) => Promise<AuxiliaryGenerationProcessorResponse>;
  maxFiles?: number;
  customPdfParse?: boolean;
};

export type AuxiliaryGenerationRunResult = AuxiliaryGenerationProcessorResponse & {
  durationSeconds: number;
};
