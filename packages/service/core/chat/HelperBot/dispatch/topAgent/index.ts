import type { HelperBotDispatchParamsType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';

export const dispatchTopAgent = async (props: HelperBotDispatchParamsType) => {
  const { query, files, metadata, histories } = props;
  const messages = helperChats2GPTMessages({
    messages: histories,
    reserveTool: false
  });
};
