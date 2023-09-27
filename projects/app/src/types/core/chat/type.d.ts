import type { ChatCompletionRequestMessage } from '@fastgpt/core/aiApi/type';

export type MessageItemType = ChatCompletionRequestMessage & { dataId?: string };
