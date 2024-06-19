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
  const maxWorkers = global.systemEnv?.tokenWorkers || 20;

  if (!global.tiktokenWorkers) {
    global.tiktokenWorkers = [];
  }

  if (global.tiktokenWorkers.length >= maxWorkers) {
    return global.tiktokenWorkers[Math.floor(Math.random() * global.tiktokenWorkers.length)];
  }

  const worker = getWorker(WorkerNameEnum.countGptMessagesTokens);

  const i = global.tiktokenWorkers.push({
    index: global.tiktokenWorkers.length,
    worker,
    callbackMap: {}
  });

  worker.on('message', ({ id, data }: { id: string; data: number }) => {
    const callback = global.tiktokenWorkers[i - 1]?.callbackMap?.[id];

    if (callback) {
      callback?.(data);
      delete global.tiktokenWorkers[i - 1].callbackMap[id];
    }
  });

  return global.tiktokenWorkers[i - 1];
};

export const countGptMessagesTokens = (
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
  functionCall?: ChatCompletionCreateParams.Function[]
) => {
  return new Promise<number>(async (resolve) => {
    try {
      const start = Date.now();

      const { worker, callbackMap } = getTiktokenWorker();

      const id = getNanoid();

      const timer = setTimeout(() => {
        console.log('Count token Time out');
        resolve(
          messages.reduce((sum, item) => {
            if (item.content) {
              return sum + item.content.length * 0.5;
            }
            return sum;
          }, 0)
        );
        delete callbackMap[id];
      }, 60000);

      callbackMap[id] = (data) => {
        // 检测是否有内存泄漏
        addLog.debug(`Count token time: ${Date.now() - start}, token: ${data}`);
        // console.log(process.memoryUsage());

        resolve(data);
        clearTimeout(timer);
      };

      // 可以进一步优化(传递100w token数据,实际需要300ms,较慢)
      worker.postMessage({
        id,
        messages,
        tools,
        functionCall
      });
    } catch (error) {
      addLog.error('Count token error', error);
      const total = messages.reduce((sum, item) => {
        if (item.content) {
          return sum + item.content.length;
        }
        return sum;
      }, 0);
      resolve(total);
    }
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
