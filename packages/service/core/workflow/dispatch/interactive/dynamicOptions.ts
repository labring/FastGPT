import {
  DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES,
  getWorkflowReferenceItems,
  isWorkflowEdgeSourceHandleValid
} from '@fastgpt/global/common/workflow/reference';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  MAX_SELECT_OPTION_COUNT,
  truncateSelectOptionText
} from '@fastgpt/global/core/workflow/optionLimit';
import type { ModuleDispatchProps } from '../../types/runtime';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { getReferenceVariableValue } from '@fastgpt/global/common/workflow/runtime';
import { createRuntimeReferenceCheck, createRuntimeReferenceGraph } from '../utils/runtime';
import { getWorkflowContext } from '../context';

/**
 * 解析动态选项变量引用列表，按勾选顺序展开并拼接为选项字符串列表（不去重）。
 * - 数组值逐元素展开，非数组值作为单个选项
 * - undefined / null / 空数组 / 空白字符串不产生选项
 * - 单项超过 100 字符时截断，最多保留前 200 个有效选项
 * - 单步调试的字面量由调用方标记，避免两个字符串被当成持久化引用
 */
export const createDynamicOptionResolver = ({
  node,
  runtimeNodesMap,
  runtimeEdges,
  chatConfig
}: Pick<
  ModuleDispatchProps<unknown>,
  'node' | 'runtimeNodesMap' | 'runtimeEdges' | 'chatConfig'
>) => {
  let variables: Record<string, unknown> | undefined;
  const isSelectable = createRuntimeReferenceCheck({
    node,
    runtimeNodesMap,
    chatConfig,
    ...createRuntimeReferenceGraph({
      runtimeEdges,
      runtimeNodesMap,
      isEdgeAllowed: (edge) =>
        isWorkflowEdgeSourceHandleValid(runtimeNodesMap.get(edge.source), edge.sourceHandle)
    })
  });

  return (value: unknown, literal = false): string[] => {
    const rawList = literal
      ? [value].flat()
      : getWorkflowReferenceItems(value)
          .filter((item) =>
            isSelectable(item, { excludeValueTypes: DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES })
          )
          .flatMap((item) =>
            [
              getReferenceVariableValue({
                value: item,
                nodesMap: runtimeNodesMap,
                variables: (variables ??= getWorkflowContext().variableContext.toRuntimeRecord())
              })
            ].flat()
          );

    return rawList
      .filter((item) => item !== undefined && item !== null)
      .map((item) =>
        truncateSelectOptionText(
          String(valueTypeFormat(item, WorkflowIOValueTypeEnum.string)).trim()
        )
      )
      .filter(Boolean)
      .slice(0, MAX_SELECT_OPTION_COUNT);
  };
};
