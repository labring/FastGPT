import { Tiktoken } from 'tiktoken/lite';
const cl100k_base = require('tiktoken/encoders/cl100k_base');

export const countToken = (text: string = '') => {
  const enc = new Tiktoken(cl100k_base.bpe_ranks, cl100k_base.special_tokens, cl100k_base.pat_str);
  const encodeText = enc.encode(text);
  return encodeText.length;
};
