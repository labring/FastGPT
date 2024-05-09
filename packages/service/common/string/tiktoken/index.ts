import {
  ChatCompletionContentPart,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { WorkerNameEnum, getWorker } from '../../../worker/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../system/log';

export const getTiktokenWorker = () => {
  if (global.tiktokenWorker) {
    return global.tiktokenWorker;
  }

  const worker = getWorker(WorkerNameEnum.countGptMessagesTokens);

  worker.on('message', ({ id, data }: { id: string; data: number }) => {
    const callback = global.tiktokenWorker?.callbackMap?.[id];

    if (callback) {
      callback?.(data);
      delete global.tiktokenWorker.callbackMap[id];
    }
  });

  global.tiktokenWorker = {
    worker,
    callbackMap: {}
  };

  return global.tiktokenWorker;
};

export const countGptMessagesTokens = (
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
  functionCall?: ChatCompletionCreateParams.Function[]
) => {
  return new Promise<number>((resolve) => {
    const start = Date.now();

    const { worker, callbackMap } = getTiktokenWorker();
    const id = getNanoid();

    const timer = setTimeout(() => {
      resolve(0);
      delete callbackMap[id];
    }, 300);

    callbackMap[id] = (data) => {
      resolve(data);
      clearTimeout(timer);

      // 检测是否有内存泄漏
      // addLog.info(`Count token time: ${Date.now() - start}, token: ${data}`);
      // console.log(process.memoryUsage());
    };

    worker.postMessage({
      id,
      messages,
      tools,
      functionCall
    });
  });
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
