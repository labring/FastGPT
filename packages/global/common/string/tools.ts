import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import path from 'path';
import { normalizeDocumentFileExtension } from '../file/utils';

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

/** 隐藏错误文本中的 URL 地址和 ns- 标识，保留 JSON 字段及转义边界。 */
export const replaceSensitiveText = (text: string) => {
  // 1. URL 脱敏保留 JSON 的引号和转义边界，避免吞掉同一行后续的错误字段。
  text = text.replace(/(?<=https?:\/\/)[^\s"\\]+/g, 'xxx');
  // 2. nx-xxx 全部替换成xxx。只替换以 ns- 开头的完整片段，
  // 不能把 tokens-per-minute、dns-server 这类普通单词里的 ns- 也换掉。
  text = text.replace(/(?<![\w-])ns-[\w-]+/g, 'xxx');

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

/**
 * 保留字符串开头 start 个和结尾 end 个 UTF-16 code unit，中间替换成省略提示。
 *
 * 截断点必须落在码点边界上：`😀` 这类非 BMP 字符由代理对组成，用 `str.slice`
 * 直接按 code unit 切会留下半个字符（孤立代理项），渲染和送模型时都会变成
 * U+FFFD 乱码。切到代理对中间时放弃那半个字符，宁可少留一个也不会产出坏字符。
 */
export const sliceStrStartEnd = (str: string | null = '', start: number, end: number) => {
  if (!str) return '';

  const overSize = str.length > start + end;

  if (!overSize) return str;

  const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
  const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

  // 头部结尾若是代理对的前半部分，说明它和后半部分被切开了，一起丢掉
  const headEnd =
    start > 0 && start < str.length && isHighSurrogate(str.charCodeAt(start - 1))
      ? start - 1
      : start;

  // 尾部开头若是代理对的后半部分，前半部分已被切掉，这个残尾也要丢掉。
  // 用正的起始下标切片，end 为 0 时不会退化成 slice(-0) 把整串拼回来。
  const tailStart = str.length - end;
  const safeTailStart =
    tailStart > 0 && tailStart < str.length && isLowSurrogate(str.charCodeAt(tailStart))
      ? tailStart + 1
      : tailStart;
  const endContent = safeTailStart >= str.length ? '' : str.slice(safeTailStart);

  return `${str.slice(0, headEnd)}\n\n...[hide ${str.length - start - end} chars]...\n\n${endContent}`;
};

/**
 * 从已解码的文件名或本地路径中提取规范化的小写扩展名（不含点号），htm/markdown 统一为 html/md。
 * 适用于纯文件名（如 originFilename、Content-Disposition filename），不剥离 ? 和 #。
 */
export const parseFilenameExtension = (filename = '') => {
  if (!filename) return '';
  const ext = path.extname(filename);
  return ext.startsWith('.') ? normalizeDocumentFileExtension(ext) : '';
};

/**
 * 优先从查询参数中的文件名提取规范化的小写扩展名，无后缀或 URL 解析失败时回退到原始链接路径。
 */
export const parseFileExtensionFromUrl = (url = '') => {
  if (!url) return '';

  // Prefer explicit filename in query params for proxy links:
  // e.g. /api/system/file/d/<alias>, or a legacy proxy URL carrying filename in query.
  try {
    const parsedUrl = new URL(url, 'http://localhost');
    const queryFilename =
      parsedUrl.searchParams.get('filename') || parsedUrl.searchParams.get('name');
    if (queryFilename) {
      // URLSearchParams 已完成解码，保留文件名中的字面量 %xx。
      const extFromQuery = parseFilenameExtension(queryFilename);
      if (extFromQuery) {
        return extFromQuery;
      }
    }
  } catch {
    // noop
    // fallback to legacy parser below
  }

  // Remove query params and hash first
  const urlWithoutQuery = url.split('?')[0].split('#')[0];
  try {
    return parseFilenameExtension(decodeURIComponent(urlWithoutQuery));
  } catch {
    return parseFilenameExtension(urlWithoutQuery);
  }
};

/**
 * Format `absNum` (at least the smallest unit) with the largest unit it reaches,
 * from units sorted largest first. When rounding to two decimals would show a
 * whole next unit, that unit is used instead: 99,999,999 reads 1亿, not 10000万,
 * and 999,999 reads 1M, not 1000K.
 */
const formatWithLargestUnit = (
  absNum: number,
  units: [size: number, unit: string][]
): string | undefined => {
  const round = (value: number) => Number(value.toFixed(2));
  const index = units.findIndex(([size]) => absNum >= size);
  if (index === -1) return undefined;
  const [size, unit] = units[index];
  const larger = units[index - 1];
  if (larger && round(absNum / size) >= larger[0] / size) {
    return `${round(absNum / larger[0])}${larger[1]}`;
  }
  return `${round(absNum / size)}${unit}`;
};

export const formatNumberWithUnit = (num: number, locale: string = 'zh-CN'): string => {
  if (num === 0) return '0';
  if (!num || isNaN(num)) return '-';
  const absNum = Math.abs(num);
  const isNegative = num < 0;
  const prefix = isNegative ? '-' : '';

  const normalizedLocale = locale.trim().toLowerCase().replaceAll('_', '-');

  if (normalizedLocale.startsWith('zh')) {
    const isHant =
      normalizedLocale === 'zh-hant' ||
      normalizedLocale.includes('hant') ||
      normalizedLocale === 'zh-tw' ||
      normalizedLocale === 'zh-hk';
    const yiUnit = isHant ? '億' : '亿';
    const wanUnit = isHant ? '萬' : '万';

    const unitText = formatWithLargestUnit(absNum, [
      [100000000, yiUnit],
      [10000, wanUnit]
    ]);
    if (unitText) return `${prefix}${unitText}`;
    return num.toLocaleString(locale);
  } else {
    const unitText = formatWithLargestUnit(absNum, [
      [1000000000, 'B'],
      [1000000, 'M'],
      [1000, 'K']
    ]);
    if (unitText) return `${prefix}${unitText}`;
    return num.toLocaleString(locale);
  }
};
