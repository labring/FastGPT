// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { type Tiktoken } from '@dqbd/tiktoken';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import Graphemer from 'graphemer';
import type { ChatItemSimpleType } from '@/types/chat';
import { ChatCompletionRequestMessage } from 'openai';
import { getOpenAiEncMap } from '@/utils/plugin/openai';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';

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
  const textDecoder = new TextDecoder();
  const graphemer = new Graphemer();

  function getChatGPTEncodingText(messages: ChatCompletionRequestMessage[], model: ModelType) {
    const isGpt3 = model === 'gpt-3.5-turbo';

    const msgSep = isGpt3 ? '\n' : '';
    const roleSep = isGpt3 ? '\n' : '<|im_sep|>';

    return [
      messages
        .map(({ name = '', role, content }) => {
          return `<|im_start|>${name || role}${roleSep}${content}<|im_end|>`;
        })
        .join(msgSep),
      `<|im_start|>assistant${roleSep}`
    ].join(msgSep);
  }
  function text2TokensLen(encoder: Tiktoken, inputText: string) {
    const encoding = encoder.encode(inputText, 'all');
    const segments: { text: string; tokens: { id: number; idx: number }[] }[] = [];

    let byteAcc: number[] = [];
    let tokenAcc: { id: number; idx: number }[] = [];
    let inputGraphemes = graphemer.splitGraphemes(inputText);

    for (let idx = 0; idx < encoding.length; idx++) {
      const token = encoding[idx]!;
      byteAcc.push(...encoder.decode_single_token_bytes(token));
      tokenAcc.push({ id: token, idx });

      const segmentText = textDecoder.decode(new Uint8Array(byteAcc));
      const graphemes = graphemer.splitGraphemes(segmentText);

      if (graphemes.every((item, idx) => inputGraphemes[idx] === item)) {
        segments.push({ text: segmentText, tokens: tokenAcc });

        byteAcc = [];
        tokenAcc = [];
        inputGraphemes = inputGraphemes.slice(graphemes.length);
      }
    }

    return segments.reduce((memo, i) => memo + i.tokens.length, 0) ?? 0;
  }
  const OpenAiEncMap = getOpenAiEncMap();
  const enc = OpenAiEncMap[model];

  let result: ChatItemSimpleType[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msgs = [...result, messages[i]];
    const tokens = text2TokensLen(
      enc,
      getChatGPTEncodingText(adaptChatItem_openAI({ messages }), model)
    );
    if (tokens < maxToken) {
      result = msgs;
    } else {
      break;
    }
  }

  return result;
}
