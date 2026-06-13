import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import path from 'path';
import { getErrText } from '../error/utils';

export const DEFAULT_MAX_STRING_LENGTH = 100_000_000;

export const getTextOversizeErrorMessage = (size = DEFAULT_MAX_STRING_LENGTH) =>
  `Text length exceeds ${size.toLocaleString('en-US')} characters.`;

export const checkStrOversize = (str: string, size = DEFAULT_MAX_STRING_LENGTH) => {
  if (str.length > size) {
    return true;
  }
  return false;
};

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

export const valToStr = (val: any) => {
  if (val === undefined) return '';
  if (val === null) return 'null';

  if (typeof val === 'object') {
    try {
      const start = Date.now();
      const res = JSON.stringify(val);

      if (Date.now() - start > 1000) {
        console.warn('Slow JSON.stringify', {
          duration: Date.now() - start,
          valLength: res.length
        });
      }

      return res;
    } catch (error) {
      console.error('Failed to stringify value', { error });
      return `Failed to stringify value: ${getErrText(error)}`;
    }
  }

  return String(val);
};

const VARIABLE_PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;
const SKIP_VARIABLE_REPLACEMENT = Symbol('skipVariableReplacement');
type ReplaceVariableOptions = {
  depth?: number;
  maxStringLength?: number;
};

const hasVariableKey = (obj: Record<string, any>, key: string) => {
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    return Object.prototype.propertyIsEnumerable.call(obj, key);
  }

  if (!(key in obj)) return false;

  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    if (Object.prototype.hasOwnProperty.call(proto, key)) {
      return Object.prototype.propertyIsEnumerable.call(proto, key);
    }
    proto = Object.getPrototypeOf(proto);
  }

  // Proxy-backed variable records can expose virtual keys through the `has` trap.
  return true;
};

/**
 * 将文本中的 `{{variable}}` 占位符替换为变量值。
 *
 * 该函数位于 global 包，不能直接读取 service env；服务侧需要把已校验的字符串上限显式传入。
 * 替换时只格式化模板实际引用的变量，避免大变量表在每次工作流节点运行时被整体 stringify。
 */
export function replaceVariable(
  text: any,
  obj: Record<string, any>,
  optionsOrDepth: ReplaceVariableOptions | number = {},
  fallbackMaxStringLength = DEFAULT_MAX_STRING_LENGTH
) {
  const { depth, maxStringLength } =
    typeof optionsOrDepth === 'number'
      ? { depth: optionsOrDepth, maxStringLength: fallbackMaxStringLength }
      : {
          depth: optionsOrDepth.depth ?? 0,
          maxStringLength: optionsOrDepth.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH
        };

  if (typeof text !== 'string') return text;
  if (checkStrOversize(text, maxStringLength)) {
    throw new Error(getTextOversizeErrorMessage(maxStringLength));
  }
  if (!text.includes('{{')) return text;

  const MAX_REPLACEMENT_DEPTH = 10;
  if (depth > MAX_REPLACEMENT_DEPTH) {
    return text;
  }

  const hasCircularReference = (value: any, targetKey: string): boolean => {
    if (typeof value !== 'string') return false;

    const selfRefPattern = new RegExp(
      `\\{\\{${targetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
      'g'
    );
    return selfRefPattern.test(value);
  };

  let result = text;
  let currentDepth = depth;

  while (currentDepth <= MAX_REPLACEMENT_DEPTH && result.includes('{{')) {
    let changed = false;
    const replacementCache = new Map<string, string | typeof SKIP_VARIABLE_REPLACEMENT>();

    result = result.replace(VARIABLE_PLACEHOLDER_PATTERN, (match: string, key: string) => {
      if (!hasVariableKey(obj, key)) return match;

      if (replacementCache.has(key)) {
        const cachedReplacement = replacementCache.get(key);
        return cachedReplacement === SKIP_VARIABLE_REPLACEMENT ? match : (cachedReplacement ?? '');
      }

      const val = obj[key];
      if (hasCircularReference(val, key)) {
        replacementCache.set(key, SKIP_VARIABLE_REPLACEMENT);
        return match;
      }

      const replacement = valToStr(val);
      replacementCache.set(key, replacement);
      if (replacement !== match) {
        changed = true;
      }
      return replacement;
    });

    if (!changed) break;
    currentDepth++;
  }

  return result || '';
}

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

/* slice json str */
export const sliceJsonStr = (str: string) => {
  str = str.trim();

  // Find first opening bracket
  let start = -1;
  let openChar = '';

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{' || str[i] === '[') {
      start = i;
      openChar = str[i];
      break;
    }
  }

  if (start === -1) return str;

  // Find matching closing bracket from the end
  const closeChar = openChar === '{' ? '}' : ']';

  for (let i = str.length - 1; i >= start; i--) {
    const ch = str[i];

    if (ch === closeChar) {
      return str.slice(start, i + 1);
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
  // e.g. /api/system/file/download/<token>?filename=image.jpg
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

  if (locale === 'zh-CN') {
    if (absNum >= 10000) {
      const value = absNum / 10000;
      const formatted = Number(value.toFixed(2)).toString();
      return `${prefix}${formatted}万`;
    }
    return num.toLocaleString(locale);
  } else {
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
