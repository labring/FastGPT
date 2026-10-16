import { isValidReferenceValueFormat } from '@fastgpt/global/common/workflow/reference';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';

/**
 * 将单个运行时值转换为可展示的选项文本。
 * - undefined / null / 空字符串会跳过（返回 undefined）
 * - 对象或数组通过 JSON.stringify 序列化为字符串
 * - 其他基础类型直接转字符串
 */
const formatSingleOptionValue = (val: unknown): string | undefined => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') {
    return val.length > 0 ? val : undefined;
  }
  if (typeof val === 'object') {
    try {
      const serialized = JSON.stringify(val);
      return serialized && serialized.length > 0 ? serialized : undefined;
    } catch {
      return undefined;
    }
  }
  const str = String(val);
  return str.length > 0 ? str : undefined;
};

/**
 * 解析动态选项变量引用列表，按勾选顺序展开并拼接为选项字符串列表（不去重）。
 *
 * 规则：
 * 1. 数组值（array* 类型或运行期数组）逐元素展开，每个元素转成字符串作为一个选项
 * 2. 非数组值整体转成字符串作为一个选项
 * 3. 取不到值（undefined / null）、空数组、空字符串不产生选项
 * 4. 多来源按顺序拼接，保留重复项
 * 5. 若输入非有效引用结构（如单步调试注入的字面量值），直接按相同规则展开为选项
 */
export const resolveDynamicOptionStrings = ({
  value,
  runtimeNodesMap,
  variables = {}
}: {
  value?: ReferenceValueType | unknown;
  runtimeNodesMap?: Map<string, RuntimeNodeItemType>;
  variables?: Record<string, unknown>;
}): string[] => {
  if (value === undefined || value === null) return [];

  const appendRawValue = (rawValue: unknown, target: string[]) => {
    if (rawValue === undefined || rawValue === null) return;

    if (Array.isArray(rawValue)) {
      for (const element of rawValue) {
        const formatted = formatSingleOptionValue(element);
        if (formatted !== undefined) {
          target.push(formatted);
        }
      }
      return;
    }

    const formatted = formatSingleOptionValue(rawValue);
    if (formatted !== undefined) {
      target.push(formatted);
    }
  };

  const isReferenceTuple = (item: unknown): item is ReferenceItemValueType =>
    isValidReferenceValueFormat(item) && (item[1] === undefined || typeof item[1] === 'string');

  // 避免单步调试注入的两个元素字符串数组（如 ["Option A", "Option B"]）被误判为单条引用
  const isSingleLiveReference =
    isReferenceTuple(value) && isValidReferenceValueFormat(value, runtimeNodesMap);
  const isReferenceTupleArray =
    Array.isArray(value) && value.length > 0 && value.every((item) => isReferenceTuple(item));

  if (!isSingleLiveReference && !isReferenceTupleArray) {
    const literalResult: string[] = [];
    appendRawValue(value, literalResult);
    return literalResult;
  }

  const refList: ReferenceItemValueType[] = isSingleLiveReference
    ? [value]
    : (value as ReferenceItemValueType[]);

  const resolveSingleSource = ([sourceNodeId, outputId]: ReferenceItemValueType): unknown => {
    if (!sourceNodeId || !outputId) return undefined;

    if (sourceNodeId === VARIABLE_NODE_ID) {
      return variables[outputId];
    }

    const sourceNode = runtimeNodesMap?.get(sourceNodeId);
    if (!sourceNode) return undefined;

    return sourceNode.outputs.find((output) => output.id === outputId)?.value;
  };

  const result: string[] = [];

  for (const refItem of refList) {
    const rawValue = resolveSingleSource(refItem);
    appendRawValue(rawValue, result);
  }

  return result;
};
