// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import type { ChatItemSimpleType } from '@/types/chat';
import { countOpenAIToken } from '@/utils/plugin/openai';

type ModelType = 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-32k';

type Props = {
  messages: ChatItemSimpleType[];
  model: ModelType;
  maxLen: number;
};
type Response = ChatItemSimpleType[];

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
  messages: ChatItemSimpleType[];
  model: ModelType;
  maxToken: number;
}) {
  let result: ChatItemSimpleType[] = [];

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
