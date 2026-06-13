import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  formatVariableValByType,
  getReferenceVariableValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  checkStrOversize,
  logOversizeString,
  valToStr,
  replaceVariable
} from '../../../../common/string/replaceVariable';

const NODE_VARIABLE_PATTERN = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
const MAX_REPLACEMENT_DEPTH = 10;

/**
 * 替换 workflow 编辑器文本中的普通变量和节点引用变量。
 *
 * 普通变量走 `{{key}}`，节点引用走 `{{$nodeId.outputId$}}`。函数只扫描模板实际出现的占位符，
 * 并直接使用系统字符串长度上限，避免调度层逐层传递 max length。
 */
export function replaceEditorVariable({
  text,
  nodesMap,
  variables
}: {
  text: any;
  nodesMap: Record<string, RuntimeNodeItemType> | Map<string, RuntimeNodeItemType>;
  variables: Record<string, unknown>; // runtime global variables
}) {
  const getNode = (nodeId: string) => {
    return nodesMap instanceof Map ? nodesMap.get(nodeId) : nodesMap[nodeId];
  };
  if (typeof text !== 'string') return text;
  if (text === '') return text;
  if (checkStrOversize(text)) {
    logOversizeString({
      source: 'replaceEditorVariable',
      reason: 'input',
      length: text.length
    });
    return text;
  }
  if (!text.includes('{{')) return text;

  text = replaceVariable(text, variables);
  if (checkStrOversize(text)) return text;

  const hasCircularReference = (value: any, targetKey: string): boolean => {
    return typeof value === 'string' && value.includes(`{{$${targetKey}$}}`);
  };

  let result = text;
  let currentDepth = 0;

  while (currentDepth <= MAX_REPLACEMENT_DEPTH && result.includes('{{$')) {
    let hasReplacements = false;
    const replacementCache = new Map<string, string | undefined>();

    result = result.replace(NODE_VARIABLE_PATTERN, (match: string, nodeId: string, id: string) => {
      const variableKey = `${nodeId}.${id}`;
      if (replacementCache.has(variableKey)) {
        const cachedReplacement = replacementCache.get(variableKey);
        return cachedReplacement === undefined ? match : cachedReplacement;
      }

      const variableVal = (() => {
        if (nodeId === VARIABLE_NODE_ID) {
          return variables[id];
        }

        // Find upstream node input/output
        const node = getNode(nodeId);
        if (!node) return;

        const output = node.outputs.find((output) => output.id === id);
        if (output) return formatVariableValByType(output.value, output.valueType);

        // Use the node's input as the variable value(Example: HTTP data will reference its own dynamic input)
        const input = node.inputs.find((input) => input.key === id);
        if (input) {
          return getReferenceVariableValue({
            value: input.value,
            nodesMap,
            variables
          });
        }
      })();

      // 直接自引用保持原占位符，交给最大深度保护兜底更复杂的环。
      if (hasCircularReference(variableVal, variableKey)) {
        replacementCache.set(variableKey, undefined);
        return match;
      }

      const replacement = valToStr(variableVal);
      replacementCache.set(variableKey, replacement);
      if (replacement !== match) {
        hasReplacements = true;
      }
      return replacement;
    });

    if (!hasReplacements) break;
    currentDepth++;

    if (checkStrOversize(result)) {
      logOversizeString({
        source: 'replaceEditorVariable',
        reason: 'node_reference_result',
        length: result.length
      });
      break;
    }

    // 旧逻辑每次处理嵌套节点引用前都会先处理普通变量，这里保留该顺序。
    if (currentDepth <= MAX_REPLACEMENT_DEPTH && result.includes('{{$')) {
      result = replaceVariable(result, variables);
      if (checkStrOversize(result)) break;
    }
  }

  return result || '';
}
