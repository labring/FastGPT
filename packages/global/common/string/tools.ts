import crypto from 'crypto';
import { customAlphabet } from 'nanoid';

/* check string is a web link */
export function strIsLink(str?: string) {
  if (!str) return false;
  if (/^((http|https)?:\/\/|www\.|\/)[^\s/$.?#].[^\s]*$/i.test(str)) return true;
  return false;
}

/* hash string */
export const hashStr = (str: string) => {
  return crypto.createHash('sha256').update(str).digest('hex');
};

/* simple text, remove chinese space and extra \n */
export const simpleText = (text = '') => {
  text = text.trim();
  text = text.replace(/([\u4e00-\u9fa5])[\s&&[^\n]]+([\u4e00-\u9fa5])/g, '$1$2');
  text = text.replace(/\r\n|\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[\s&&[^\n]]{2,}/g, ' ');
  text = text.replace(/[\x00-\x08]/g, ' ');

  return text;
};

/* 
  replace {{variable}} to value
*/
export function replaceVariable(text: string, obj: Record<string, string | number>) {
  for (const key in obj) {
    const val = obj[key];
    if (!['string', 'number'].includes(typeof val)) continue;

    text = text.replace(new RegExp(`{{(${key})}}`, 'g'), String(val));
  }
  return text || '';
}

/* replace sensitive text */
export const replaceSensitiveText = (text: string) => {
  // 1. http link
  text = text.replace(/(?<=https?:\/\/)[^\s]+/g, 'xxx');
  // 2. nx-xxx 全部替换成xxx
  text = text.replace(/ns-[\w-]+/g, 'xxx');

  return text;
};

export const getNanoid = (size = 12) => {
  return customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', size)();
};

export const replaceRegChars = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
