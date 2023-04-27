import crypto from 'crypto';
import { useToast } from '@/hooks/useToast';
import { encoding_for_model, type Tiktoken } from '@dqbd/tiktoken';
import Graphemer from 'graphemer';
import { ChatModelEnum } from '@/constants/model';

const textDecoder = new TextDecoder();
const graphemer = new Graphemer();
let encMap: Record<string, Tiktoken>;
const getEncMap = () => {
  if (encMap) return encMap;
  encMap = {
    'gpt-3.5-turbo': encoding_for_model('gpt-3.5-turbo', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    }),
    'gpt-4': encoding_for_model('gpt-4', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    }),
    'gpt-4-32k': encoding_for_model('gpt-4-32k', {
      '<|im_start|>': 100264,
      '<|im_end|>': 100265,
      '<|im_sep|>': 100266
    })
  };
  return encMap;
};

/**
 * copy text data
 */
export const useCopyData = () => {
  const { toast } = useToast();

  return {
    copyData: async (data: string, title: string = '复制成功') => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data);
        } else {
          throw new Error('');
        }
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = data;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      toast({
        title,
        status: 'success',
        duration: 1000
      });
    }
  };
};

/**
 * 密码加密
 */
export const createHashPassword = (text: string) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return hash;
};

/**
 * 对象转成 query 字符串
 */
export const Obj2Query = (obj: Record<string, string | number>) => {
  const queryParams = new URLSearchParams();
  for (const key in obj) {
    queryParams.append(key, `${obj[key]}`);
  }
  return queryParams.toString();
};

/* 格式化 chat 聊天内容 */
function getChatGPTEncodingText(
  messages: { role: 'system' | 'user' | 'assistant'; content: string; name?: string }[],
  model: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-32k'
) {
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
export const countChatTokens = ({
  model = 'gpt-3.5-turbo',
  messages
}: {
  model?: `${ChatModelEnum}`;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
}) => {
  const text = getChatGPTEncodingText(messages, model);
  return text2TokensLen(getEncMap()[model], text);
};
