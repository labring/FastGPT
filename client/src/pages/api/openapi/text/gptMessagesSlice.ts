// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import type { ChatItemType } from '@/types/chat';
import { countOpenAIToken } from '@/utils/plugin/openai';
import { OpenAiChatEnum } from '@/constants/model';

type ModelType = `${OpenAiChatEnum}`;

type Props = {
  messages: ChatItemType[];
  model: ModelType;
  maxLen: number;
};
type Response = ChatItemType[];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req });

    const { messages, model, maxLen } = req.body as Props;

    if (!Array.isArray(messages) || !model || !maxLen) {
      throw new Error('params is error');
    }

    return jsonRes<Response>(res, {
      data: gpt_chatItemTokenSlice({
        messages,
        model,
        maxToken: maxLen
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export function gpt_chatItemTokenSlice({
  messages,
  model,
  maxToken
}: {
  messages: ChatItemType[];
  model: ModelType;
  maxToken: number;
}) {
  let result: ChatItemType[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msgs = [...result, messages[i]];

    const tokens = countOpenAIToken({ messages: msgs, model });

    if (tokens < maxToken) {
      result = msgs;
    } else {
      break;
    }
  }

  return result.length === 0 && messages[0] ? [messages[0]] : result;
}
