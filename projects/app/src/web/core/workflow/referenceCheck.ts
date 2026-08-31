import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  filterSelectableWorkflowNodeOutputs,
  getWorkflowGlobalVariables,
  getWorkflowReferenceItems,
  isConfiguredReferenceValue,
  isWorkflowReferenceItem,
  type WorkflowReferenceSourceNode,
  workflowValueTypeIsCompatible
} from './utils';

export type WorkflowReferenceStatusCode =
  | 'empty'
  | 'valid'
  | 'invalid_reference'
  | 'unreachable_reference'
  | 'invalid_reference_type';

export type WorkflowReferenceStatus = {
  code: WorkflowReferenceStatusCode;
  sourceType?: WorkflowIOValueTypeEnum;
};

export type WorkflowReferenceIssueCode = Exclude<WorkflowReferenceStatusCode, 'empty' | 'valid'>;

type GetWorkflowReferenceStatusProps = {
  value: unknown;
  valueType?: WorkflowIOValueTypeEnum;
  sourceNodeIds?: Iterable<string>;
  sourceNodes?: WorkflowReferenceSourceNode[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  chatConfig?: AppChatConfigType;
};

const isMalformedReferenceValue = (value: unknown) => {
  if (!isConfiguredReferenceValue(value) || isWorkflowReferenceItem(value)) return false;
  if (!Array.isArray(value)) return true;
  return value.some((item) => !isWorkflowReferenceItem(item));
};

/**
 * 判断单项引用状态。输出可用性优先于来源范围，保证失效输出不会被误报为不可达。
 * 普通来源只在显式存在于 sourceNodeIds 时可用；global reference 单独按 chatConfig 查询。
 */
export const getWorkflowReferenceStatus = ({
  value,
  valueType,
  sourceNodeIds,
  sourceNodes,
  getNodeById,
  chatConfig
}: GetWorkflowReferenceStatusProps): WorkflowReferenceStatus => {
  if (!isConfiguredReferenceValue(value)) return { code: 'empty' };
  if (!isWorkflowReferenceItem(value)) return { code: 'invalid_reference' };

  const [sourceNodeId, outputId] = value;
  const sourceNode =
    sourceNodes?.find((node) => node.nodeId === sourceNodeId) ?? getNodeById(sourceNodeId);

  if (sourceNodeId === VARIABLE_NODE_ID) {
    if (chatConfig !== undefined) {
      const globalVariable = getWorkflowGlobalVariables({ chatConfig }).find(
        (variable) => variable.key === outputId
      );
      if (!globalVariable) return { code: 'invalid_reference' };
      if (!workflowValueTypeIsCompatible(globalVariable.valueType, valueType)) {
        return {
          code: 'invalid_reference_type',
          sourceType: globalVariable.valueType
        };
      }
      return { code: 'valid', sourceType: globalVariable.valueType };
    }

    if (!sourceNode) return { code: 'valid' };
  }

  const sourceOutput = sourceNode?.outputs.find((output) => output.id === outputId);
  if (!sourceNode || !sourceOutput) return { code: 'invalid_reference' };

  const selectableOutput = filterSelectableWorkflowNodeOutputs({
    outputs: [sourceOutput],
    valueType: WorkflowIOValueTypeEnum.any,
    catchError: sourceNode.catchError
  });
  if (!selectableOutput.length) {
    return { code: 'invalid_reference', sourceType: sourceOutput.valueType };
  }

  if (
    sourceNodeId !== VARIABLE_NODE_ID &&
    sourceNodeIds &&
    !new Set(sourceNodeIds).has(sourceNodeId)
  ) {
    return { code: 'unreachable_reference', sourceType: sourceOutput.valueType };
  }

  if (!workflowValueTypeIsCompatible(sourceOutput.valueType, valueType)) {
    return { code: 'invalid_reference_type', sourceType: sourceOutput.valueType };
  }

  return { code: 'valid', sourceType: sourceOutput.valueType };
};

/** 将单选、多选和 malformed 值统一转换为引用状态，保留多选原顺序。 */
export const getWorkflowReferenceStatuses = ({
  value,
  ...props
}: GetWorkflowReferenceStatusProps): WorkflowReferenceStatus[] => {
  const referenceItems = getWorkflowReferenceItems(value);
  const statuses = referenceItems.map((item) =>
    getWorkflowReferenceStatus({ value: item, ...props })
  );

  if (
    isMalformedReferenceValue(value) ||
    (statuses.length === 0 && isConfiguredReferenceValue(value))
  ) {
    return [{ code: 'invalid_reference' }, ...statuses];
  }

  return statuses;
};

/** 将多项引用状态聚合为一个稳定的 checker issue code。 */
export const getWorkflowReferenceIssueCode = (
  statuses: WorkflowReferenceStatus[]
): WorkflowReferenceIssueCode | undefined =>
  (['invalid_reference', 'unreachable_reference', 'invalid_reference_type'] as const).find((code) =>
    statuses.some((status) => status.code === code)
  );

/** 判断引用是否仍可被调试输入或 selector 接受；历史失效项不会成为新值。 */
export const workflowReferenceValueIsSelectable = ({
  value,
  sourceNodes,
  valueType,
  chatConfig
}: {
  value?: ReferenceValueType;
  sourceNodes: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
  chatConfig?: AppChatConfigType;
}) =>
  getWorkflowReferenceItems(value).some(
    (item) =>
      getWorkflowReferenceStatus({
        value: item,
        valueType,
        sourceNodes,
        sourceNodeIds: sourceNodes.map((node) => node.nodeId),
        getNodeById: () => undefined,
        chatConfig
      }).code === 'valid'
  );
