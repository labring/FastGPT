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

export const valToStr = (val: any) => {
  if (val === undefined) return '';
  if (val === null) return 'null';

  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// replace {{variable}} to value
export function replaceVariable(
  text: any,
  obj: Record<string, string | number | undefined>,
  depth = 0
) {
  if (typeof text !== 'string') return text;

  const MAX_REPLACEMENT_DEPTH = 10;
  const processedVariables = new Set<string>();

  // Prevent infinite recursion
  if (depth > MAX_REPLACEMENT_DEPTH) {
    return text;
  }

  // Check for circular references in variable values
  const hasCircularReference = (value: any, targetKey: string): boolean => {
    if (typeof value !== 'string') return false;

    // Check if the value contains the target variable pattern (direct self-reference)
    const selfRefPattern = new RegExp(
      `\\{\\{${targetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
      'g'
    );
    return selfRefPattern.test(value);
  };

  let result = text;
  let hasReplacements = false;

  // Build replacement map first to avoid modifying string during iteration
  const replacements: { pattern: string; replacement: string }[] = [];

  for (const key in obj) {
    // Skip if already processed to avoid immediate circular reference
    if (processedVariables.has(key)) {
      continue;
    }

    const val = obj[key];

    // Check for direct circular reference
    if (hasCircularReference(String(val), key)) {
      continue;
    }

    const formatVal = valToStr(val);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    replacements.push({
      pattern: `{{(${escapedKey})}}`,
      replacement: formatVal
    });

    processedVariables.add(key);
    hasReplacements = true;
  }

  // Apply all replacements
  replacements.forEach(({ pattern, replacement }) => {
    result = result.replace(new RegExp(pattern, 'g'), () => replacement);
  });

  // If we made replacements and there might be nested variables, recursively process
  if (hasReplacements && /\{\{[^}]+\}\}/.test(result)) {
    result = replaceVariable(result, obj, depth + 1);
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

export const getRegQueryStr = (text: string, flags = 'i') => {
  const formatText = replaceRegChars(text);
  const chars = formatText.split('');
  const regexPattern = chars.join('.*');

  return new RegExp(regexPattern, flags);
};

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

export const sliceStrStartEnd = (str: string, start: number, end: number) => {
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
  // Remove query params
  const urlWithoutQuery = url.split('?')[0];
  // Get file name
  const fileName = urlWithoutQuery.split('/').pop() || '';
  // Get file extension
  const extension = fileName.split('.').pop();
  return (extension || '').toLowerCase();
};
