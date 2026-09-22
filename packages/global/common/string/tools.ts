import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import path from 'path';

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
  // `[^\S\r\n]` \u662f\u201c\u9664\u6362\u884c\u5916\u7684\u7a7a\u767d\u201d\uff1b`[\s&&[^\n]]` \u7684\u4ea4\u96c6\u5199\u6cd5\u53ea\u5728 v \u6807\u5fd7\u4e0b\u6210\u7acb\uff0c
  // \u666e\u901a\u6b63\u5219\u4f1a\u628a\u672b\u5c3e\u7684 `]` \u5f53\u5b57\u9762\u91cf\uff0c\u53cd\u800c\u4f1a\u5220\u6389\u6b63\u6587\u91cc\u7684 `]]`\u3002
  // Matching the character on the right consumes it, so the next run of blanks
  // has no Chinese character in front of it any more and only every second
  // gap is closed. Look ahead instead of capturing, so every gap is seen.
  text = text.replace(/(?<=[\u4e00-\u9fa5])[^\S\r\n]+(?=[\u4e00-\u9fa5])/g, '');
  text = text.replace(/\r\n|\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  // \u53ea\u538b\u7f29\u6b63\u6587\u5b57\u7b26\u4e4b\u95f4\u7684\u591a\u4f59\u7a7a\u767d\uff0c\u4fdd\u7559\u884c\u9996\u7f29\u8fdb\u548c Markdown \u786c\u6362\u884c\u6240\u9700\u7684\u884c\u5c3e\u7a7a\u683c\u3002
  text = text.replace(/(?<=\S)[^\S\r\n]{2,}(?=\S)/g, ' ');
  text = text.replace(/[\x00-\x08]/g, ' ');

  return text;
};

/* replace sensitive text */
export const replaceSensitiveText = (text: string) => {
  // 1. http link
  text = text.replace(/(?<=https?:\/\/)[^\s]+/g, 'xxx');
  // 2. nx-xxx 全部替换成xxx
  text = text.replace(/ns-[\w-]+/g, 'xxx');

  return text;
};

/* Make sure the first letter is definitely lowercase */
export const getNanoid = (size = 16) => {
  const firstChar = customAlphabet('abcdefghijklmnopqrstuvwxyz', 1)();

  if (size === 1) return firstChar;

  const randomsStr = customAlphabet(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
    size - 1
  )();

  return `${firstChar}${randomsStr}`;
};
export const customNanoid = (str: string, size: number) => customAlphabet(str, size)();

/* Custom text to reg, need to replace special chats */
export const replaceRegChars = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Extract the first complete JSON value out of a model's answer.
 *
 * Walks forward from the first opening bracket and returns as soon as that
 * value closes, so anything written after it is left out -- a second object, a
 * closing code fence followed by a note, a sentence mentioning a {placeholder}.
 * Searching backwards for the last closing bracket instead would swallow all
 * of it.
 *
 * The result is handed to `jsonrepair` / `json5.parse`, so the scan follows
 * JSON5: single- and double-quoted strings, `//` line comments and block
 * comments are non-structural and their brackets are not counted.
 *
 * A string with no bracket, or a value that never closes, is returned
 * unchanged and left to the caller's repair step, as before.
 */
export const sliceJsonStr = (str: string) => {
  str = str.trim();

  // Find first opening bracket
  const start = str.search(/[{\[]/);
  if (start === -1) return str;

  const openChar = str[start];
  const closeChar = openChar === '{' ? '}' : ']';

  let depth = 0;
  let stringChar: string | undefined;
  let escaped = false;
  let comment: 'line' | 'block' | undefined;

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (comment === 'line') {
      if (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') {
        comment = undefined;
      }
      continue;
    }
    if (comment === 'block') {
      if (ch === '*' && str[i + 1] === '/') {
        comment = undefined;
        i++;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      if (stringChar) escaped = true;
      continue;
    }
    if (stringChar) {
      if (ch === stringChar) stringChar = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      stringChar = ch;
      continue;
    }
    if (ch === '/' && (str[i + 1] === '/' || str[i + 1] === '*')) {
      comment = str[i + 1] === '/' ? 'line' : 'block';
      i++;
      continue;
    }

    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }

  return str;
};

export const sliceStrStartEnd = (str: string | null = '', start: number, end: number) => {
  if (!str) return '';

  const overSize = str.length > start + end;

  if (!overSize) return str;

  const startContent = str.slice(0, start);
  const endContent = overSize ? str.slice(-end) : '';

  return `${startContent}${overSize ? `\n\n...[hide ${str.length - start - end} chars]...\n\n` : ''}${endContent}`;
};

/*
  Parse file extension from url
  Test：
  1. https://xxx.com/file.pdf?token=123
    => pdf
  2. https://xxx.com/file.pdf
    => pdf
*/
export const parseFileExtensionFromUrl = (url = '') => {
  // Prefer explicit filename in query params for proxy links:
  // e.g. /api/system/file/d/<alias>, or a legacy proxy URL carrying filename in query.
  try {
    const parsedUrl = new URL(url, 'http://localhost');
    const queryFilename =
      parsedUrl.searchParams.get('filename') || parsedUrl.searchParams.get('name');
    if (queryFilename) {
      const extFromQuery = path.extname(decodeURIComponent(queryFilename));
      if (extFromQuery.startsWith('.')) {
        return extFromQuery.slice(1).toLowerCase();
      }
    }
  } catch {
    // noop
    // fallback to legacy parser below
  }

  // Remove query params and hash first
  const urlWithoutQuery = url.split('?')[0].split('#')[0];
  const extension = path.extname(urlWithoutQuery);
  // path.extname returns '.ext' or ''
  if (extension.startsWith('.')) {
    return extension.slice(1).toLowerCase();
  }
  return '';
};

export const formatNumberWithUnit = (num: number, locale: string = 'zh-CN'): string => {
  if (num === 0) return '0';
  if (!num || isNaN(num)) return '-';
  const absNum = Math.abs(num);
  const isNegative = num < 0;
  const prefix = isNegative ? '-' : '';

  if (locale.startsWith('zh')) {
    const isHant =
      locale === 'zh-Hant' ||
      locale.toLowerCase().includes('hant') ||
      locale === 'zh-TW' ||
      locale === 'zh-HK';
    const yiUnit = isHant ? '億' : '亿';
    const wanUnit = isHant ? '萬' : '万';

    if (absNum >= 100000000) {
      const value = absNum / 100000000;
      const formatted = Number(value.toFixed(2)).toString();
      return `${prefix}${formatted}${yiUnit}`;
    }
    if (absNum >= 10000) {
      const value = absNum / 10000;
      const formatted = Number(value.toFixed(2)).toString();
      return `${prefix}${formatted}${wanUnit}`;
    }
    return num.toLocaleString(locale);
  } else {
    if (absNum >= 1000000000) {
      const value = absNum / 1000000000;
      const formatted = Number(value.toFixed(2)).toString();
      return `${prefix}${formatted}B`;
    }
    if (absNum >= 1000000) {
      const value = absNum / 1000000;
      const formatted = Number(value.toFixed(2)).toString();
      return `${prefix}${formatted}M`;
    }
    if (absNum >= 1000) {
      const value = absNum / 1000;
      const formatted = Number(value.toFixed(2)).toString();
      return `${prefix}${formatted}K`;
    }
    return num.toLocaleString(locale);
  }
};

