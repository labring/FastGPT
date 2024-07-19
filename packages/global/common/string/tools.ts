import { RuntimeNodeItemType } from 'core/workflow/runtime/type';
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import { DEFAULT_PARENT_ID } from './constant';

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
export function replaceVariable(text: any, obj: Record<string, string | number>) {
  if (!(typeof text === 'string')) return text;

  for (const key in obj) {
    const val = obj[key];
    if (!['string', 'number'].includes(typeof val)) continue;

    text = text.replace(new RegExp(`{{(${key})}}`, 'g'), String(val));
    text = text.replace(
      new RegExp(`\\{\\{\\$(${DEFAULT_PARENT_ID}\\.${key})\\$\\}\\}`, 'g'),
      String(val)
    );
  }
  return text || '';
}

export function replaceVariableLabel(
  text: any,
  nodes: RuntimeNodeItemType[],
  obj: Record<string, string | number>
) {
  if (!(typeof text === 'string')) return text;

  const globalVariables = Object.keys(obj).map((key) => {
    return {
      nodeId: 'VARIABLE_NODE_ID',
      id: key,
      value: obj[key]
    };
  });

  const nodeVariables = nodes
    .map((node) => {
      return node.outputs.map((output) => {
        return {
          nodeId: node.nodeId,
          id: output.id,
          value: output.value
        };
      });
    })
    .flat();

  const allVariables = [...globalVariables, ...nodeVariables];

  for (const key in allVariables) {
    const val = allVariables[key];
    if (!['string', 'number'].includes(typeof val.value)) continue;
    const regex = new RegExp(`\\{\\{\\$(${val.nodeId}\\.${val.id})\\$\\}\\}`, 'g');

    text = text.replace(regex, String(val.value));
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

/* Make sure the first letter is definitely lowercase */
export const getNanoid = (size = 12) => {
  const firstChar = customAlphabet('abcdefghijklmnopqrstuvwxyz', 1)();

  if (size === 1) return firstChar;

  const randomsStr = customAlphabet(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
    size - 1
  )();

  return `${firstChar}${randomsStr}`;
};

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
  str = str.replace(/(\\n|\\)/g, '').replace(/  /g, '');

  const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
  const matches = str.match(jsonRegex);

  if (!matches) {
    return '';
  }

  // 找到第一个完整的 JSON 字符串
  const jsonStr = matches[0];

  return jsonStr;
};
