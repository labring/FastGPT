import { formatPrice } from './user';
import dayjs from 'dayjs';
import type { BillSchema } from '../types/mongoSchema';
import type { UserBillType } from '@/types/user';
import { ChatItemType } from '@/types/chat';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatRoleEnum } from '@/constants/chat';
import type { MessageItemType } from '@/pages/api/openapi/v1/chat/completions';

export const adaptBill = (bill: BillSchema): UserBillType => {
  return {
    id: bill._id,
    type: bill.type,
    modelName: bill.modelName,
    time: bill.time,
    textLen: bill.textLen,
    tokenLen: bill.tokenLen,
    price: formatPrice(bill.price)
  };
};

export const gptMessage2ChatType = (messages: MessageItemType[]): ChatItemType[] => {
  const roleMap: Record<`${ChatCompletionRequestMessageRoleEnum}`, `${ChatRoleEnum}`> = {
    [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
    [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
    [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
    [ChatCompletionRequestMessageRoleEnum.Function]: ChatRoleEnum.Human
  };

  return messages.map((item) => ({
    _id: item._id,
    obj: roleMap[item.role],
    value: item.content || ''
  }));
};

export const textAdaptGptResponse = ({
  text,
  model,
  finish_reason = null,
  extraData = {}
}: {
  model?: string;
  text: string | null;
  finish_reason?: null | 'stop';
  extraData?: Object;
}) => {
  return JSON.stringify({
    ...extraData,
    id: '',
    object: '',
    created: 0,
    model,
    choices: [{ delta: text === null ? {} : { content: text }, index: 0, finish_reason }]
  });
};

const decoder = new TextDecoder();
export const parseStreamChunk = (value: BufferSource) => {
  const chunk = decoder.decode(value);
  const chunkLines = chunk.split('\n\n').filter((item) => item);
  const chunkResponse = chunkLines.map((item) => {
    const splitEvent = item.split('\n');
    if (splitEvent.length === 2) {
      return {
        event: splitEvent[0].replace('event: ', ''),
        data: splitEvent[1].replace('data: ', '')
      };
    }
    return {
      event: '',
      data: splitEvent[0].replace('data: ', '')
    };
  });

  return chunkResponse;
};
