import { isValidReferenceValueFormat } from '@fastgpt/global/common/workflow/reference';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  getReferenceVariableValue,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';

/**
 * 解析动态选项变量引用列表，按勾选顺序展开并拼接为选项字符串列表（不去重）。
 * - 数组值逐元素展开，非数组值作为单个选项
 * - undefined / null / 空数组 / 空白字符串不产生选项
 * - 若输入非引用数组（如单步调试直接传入的字面量值），按相同规则展开
 */
export const resolveDynamicOptionStrings = ({
  value,
  runtimeNodesMap = new Map(),
  variables = {}
}: {
  value?: ReferenceValueType | unknown;
  runtimeNodesMap?: Map<string, RuntimeNodeItemType>;
  variables?: Record<string, unknown>;
}): string[] => {
  if (value === undefined || value === null) return [];

  const isReferenceArray =
    Array.isArray(value) && value.every((item) => isValidReferenceValueFormat(item));
  const rawList = isReferenceArray
    ? value.flatMap((item) =>
        isValidReferenceValueFormat(item, runtimeNodesMap)
          ? [
              getReferenceVariableValue({
                value: item,
                nodesMap: runtimeNodesMap,
                variables
              })
            ].flat()
          : []
      )
    : [value].flat();

  return rawList
    .filter((item) => item !== undefined && item !== null)
    .map((item) => String(valueTypeFormat(item, WorkflowIOValueTypeEnum.string)).trim())
    .filter(Boolean);
};
