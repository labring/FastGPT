import {
  type ChatCompletionContentPart,
  type ChatCompletionCreateParams,
  type ChatCompletionMessageParam,
  type ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { WorkerNameEnum, getWorkerController } from '../../../worker/utils';
import type { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

export const countGptMessagesTokens = async (
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
  functionCall?: ChatCompletionCreateParams.Function[]
) => {
  try {
    const workerController = getWorkerController<
      {
        messages: ChatCompletionMessageParam[];
        tools?: ChatCompletionTool[];
        functionCall?: ChatCompletionCreateParams.Function[];
      },
      number
    >({
      name: WorkerNameEnum.countGptMessagesTokens,
      maxReservedThreads: global.systemEnv?.tokenWorkers || 30
    });

    const total = await workerController.run({ messages, tools, functionCall });

    return total;
  } catch (error) {
    logger.error('Token count worker failed, using fallback', { error });
    const total = messages.reduce((sum, item) => {
      if (item.content) {
        return sum + item.content.length * 0.5;
      }
      return sum;
    }, 0);
    return total;
  }
};

export const countMessagesTokens = (messages: ChatItemType[]) => {
  const adaptMessages = chats2GPTMessages({ messages, reserveId: true });

  return countGptMessagesTokens(adaptMessages);
};

/* count one prompt tokens */
export const countPromptTokens = async (
  prompt: string | ChatCompletionContentPart[] | null | undefined = '',
  role: '' | `${ChatCompletionRequestMessageRoleEnum}` = ''
) => {
  const total = await countGptMessagesTokens([
    {
      //@ts-ignore
      role,
      content: prompt
    }
  ]);

  return total;
};
