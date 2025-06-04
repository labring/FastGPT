import { customAlphabet } from 'nanoid';
export const replaceSensitiveText = (text: string) => {
  // 1. http link
  text = text.replace(/(?<=https?:\/\/)[^\s]+/g, 'xxx');
  // 2. nx-xxx 全部替换成xxx
  text = text.replace(/ns-[\w-]+/g, 'xxx');

  return text;
};

export const getNanoid = (length: number) => {
  return customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', length)();
};
