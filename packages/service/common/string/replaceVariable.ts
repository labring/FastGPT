import { getErrText } from '@fastgpt/global/common/error/utils';
import { SYSTEM_MAX_STRING_LENGTH } from '../../env';
import { getLogger, LogCategories } from '../logger';

const VARIABLE_PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;
const MAX_REPLACEMENT_DEPTH = 10;
const logger = getLogger(LogCategories.SYSTEM);

/**
 * 将变量值按变量替换的历史语义转成字符串。
 *
 * `undefined` 输出空字符串，`null` 输出 `"null"`，对象走 JSON.stringify；
 * stringify 慢或失败时保留原有日志行为，便于定位超大对象或循环引用。
 */
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

export const checkStrOversize = (str: string) => str.length > SYSTEM_MAX_STRING_LENGTH;

/**
 * 记录同步字符串处理遇到超长文本的情况。日志只包含长度和上下文，不输出正文，
 * 避免大文本进入日志系统造成额外 CPU/IO 压力。
 */
export const logOversizeString = ({
  source,
  reason,
  length
}: {
  source: string;
  reason: string;
  length: number;
}) => {
  logger.info('Oversize string detected during synchronous string processing', {
    source,
    reason,
    length,
    maxLength: SYSTEM_MAX_STRING_LENGTH
  });
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
 * 替换时只格式化模板实际引用的变量，避免大变量表在每次工作流节点运行时被整体 stringify。
 * 字符串长度上限统一使用 service env 初始化后得到的系统配置，不由调用方逐层传递。
 */
export const replaceVariable = (text: any, obj: Record<string, any>) => {
  if (typeof text !== 'string') return text;
  if (checkStrOversize(text)) {
    logOversizeString({
      source: 'replaceVariable',
      reason: 'input',
      length: text.length
    });
    return text;
  }
  if (!text.includes('{{')) return text;

  const hasCircularReference = (value: any, targetKey: string): boolean => {
    return typeof value === 'string' && value.includes(`{{${targetKey}}}`);
  };

  let result = text;
  let currentDepth = 0;

  while (currentDepth <= MAX_REPLACEMENT_DEPTH && result.includes('{{')) {
    let changed = false;
    const replacementCache = new Map<string, string | undefined>();

    result = result.replace(VARIABLE_PLACEHOLDER_PATTERN, (match: string, key: string) => {
      if (!hasVariableKey(obj, key)) return match;

      if (replacementCache.has(key)) {
        const cachedReplacement = replacementCache.get(key);
        return cachedReplacement === undefined ? match : cachedReplacement;
      }

      const val = obj[key];
      if (hasCircularReference(val, key)) {
        replacementCache.set(key, undefined);
        return match;
      }

      const replacement = valToStr(val);
      replacementCache.set(key, replacement);
      if (replacement !== match) {
        changed = true;
      }
      return replacement;
    });

    if (checkStrOversize(result)) {
      logOversizeString({
        source: 'replaceVariable',
        reason: 'replacement_result',
        length: result.length
      });
      break;
    }

    if (!changed) break;
    currentDepth++;
  }

  return result || '';
};
