import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  formatVariableValByType,
  getReferenceVariableValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import { checkStrOversize, logOversizeString } from '../../../../common/string/replaceVariable';

/**
 * 替换 JSON 文本中的 {{var}} / {{$node.output$}}，并按是否在引号内做 JSON 转义。
 * HTTP JSON Body、JSON Editor 对象/数组入参共用，避免引号换行把 JSON 弄坏。
 */
export const replaceJsonBodyString = (
  { text, depth = 0 }: { text: string; depth?: number },
  props: {
    allVariables: Record<string, any>;
    runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  }
) => {
  const { allVariables, runtimeNodesMap } = props;

  const MAX_REPLACEMENT_DEPTH = 10;

  // Prevent infinite recursion
  if (depth > MAX_REPLACEMENT_DEPTH) {
    return text;
  }
  if (checkStrOversize(text)) {
    logOversizeString({
      source: 'replaceJsonBodyString',
      reason: depth === 0 ? 'input' : 'recursive_input',
      length: text.length
    });
    return text;
  }

  /**
   * 为 replace callback 的递增 offset 做惰性引号状态扫描。
   * 旧实现每个变量都 substring + match 重新计算一次，变量多且 body 大时会放大 CPU。
   */
  const createQuoteChecker = (source: string) => {
    let cursor = 0;
    let inQuotes = false;
    let escaped = false;

    return (offset: number) => {
      while (cursor < offset) {
        const char = source[cursor];
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        }
        cursor++;
      }
      return inQuotes;
    };
  };

  const valToStr = (val: any, isQuoted = false) => {
    if (val === undefined || val === null) {
      if (isQuoted) return '';
      return 'null';
    }

    if (typeof val === 'object') {
      const jsonStr = JSON.stringify(val);
      if (isQuoted) {
        // Only escape quotes for JSON strings inside quotes (backslashes are already properly escaped by JSON.stringify)
        return jsonStr.replace(/"/g, '\\"');
      }
      return jsonStr;
    }

    if (typeof val === 'string') {
      if (isQuoted) {
        const jsonStr = JSON.stringify(val);
        return jsonStr.slice(1, -1); // 移除首尾的双引号
      }
      try {
        JSON.parse(val);
        return val;
      } catch {
        const str = JSON.stringify(val);
        return str.startsWith('"') && str.endsWith('"') ? str.slice(1, -1) : str;
      }
    }

    return String(val);
  };

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
  let currentDepth = depth;

  const regex1 = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
  const regex2 = /{{([^}]+)}}/g;

  while (currentDepth <= MAX_REPLACEMENT_DEPTH && result.includes('{{')) {
    let hasReplacements = false;

    // 1. Replace {{$nodeId.id$}} variables
    const nodeReplacementCache = new Map<string, string | undefined>();
    const isNodeVariableInQuotes = createQuoteChecker(result);

    result = result.replace(
      regex1,
      (fullMatch: string, nodeId: string, id: string, offset: number) => {
        const variableKey = `${nodeId}.${id}`;

        if (nodeReplacementCache.has(variableKey)) {
          const cachedReplacement = nodeReplacementCache.get(variableKey);
          return cachedReplacement === undefined ? fullMatch : cachedReplacement;
        }

        // 检查变量是否在引号内
        const isInQuotes = isNodeVariableInQuotes(offset);

        const variableVal = (() => {
          if (nodeId === VARIABLE_NODE_ID) {
            return allVariables[id];
          }
          // Find upstream node input/output
          const node = runtimeNodesMap.get(nodeId);
          if (!node) return;

          const output = node.outputs.find((output) => output.id === id);
          if (output) return formatVariableValByType(output.value, output.valueType);

          const input = node.inputs.find((input) => input.key === id);
          if (input) {
            return getReferenceVariableValue({
              value: input.value,
              nodesMap: runtimeNodesMap,
              variables: allVariables
            });
          }
        })();

        // Check for direct circular reference
        if (hasCircularReference(String(variableVal), variableKey)) {
          nodeReplacementCache.set(variableKey, undefined);
          return fullMatch;
        }

        const formatVal = valToStr(variableVal, isInQuotes);
        nodeReplacementCache.set(variableKey, formatVal);
        if (formatVal !== fullMatch) {
          hasReplacements = true;
        }
        return formatVal;
      }
    );

    // 2. Replace {{key}} variables
    const variableReplacementCache = new Map<string, string | undefined>();
    const isVariableInQuotes = createQuoteChecker(result);

    result = result.replace(regex2, (fullMatch: string, key: string, offset: number) => {
      if (variableReplacementCache.has(key)) {
        const cachedReplacement = variableReplacementCache.get(key);
        return cachedReplacement === undefined ? fullMatch : cachedReplacement;
      }

      const variableVal = allVariables[key];

      // Check for direct circular reference
      if (hasCircularReference(variableVal, key)) {
        variableReplacementCache.set(key, undefined);
        return fullMatch;
      }

      // 检查变量是否在引号内
      const isInQuotes = isVariableInQuotes(offset);
      const formatVal = valToStr(variableVal, isInQuotes);

      variableReplacementCache.set(key, formatVal);
      if (formatVal !== fullMatch) {
        hasReplacements = true;
      }
      return formatVal;
    });

    if (checkStrOversize(result)) {
      logOversizeString({
        source: 'replaceJsonBodyString',
        reason: 'replacement_result',
        length: result.length
      });
      return result;
    }

    if (!hasReplacements) break;
    currentDepth++;
  }

  return result.replace(/(".*?")\s*:\s*undefined\b/g, '$1:null');
};
