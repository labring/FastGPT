import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type {
  FlowNodeInputItemType,
  ReferenceItemValueType,
  ReferenceValueType,
  WorkflowReferenceSnapshot
} from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { Node } from 'reactflow';
import { isEqual } from 'lodash-es';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
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
  sourceNodes?: WorkflowReferenceSourceNode[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  chatConfig?: AppChatConfigType;
};

const isMalformedReferenceValue = (value: unknown) => {
  if (!isConfiguredReferenceValue(value) || isWorkflowReferenceItem(value)) return false;
  if (!Array.isArray(value)) return true;
  return value.some((item) => !isWorkflowReferenceItem(item));
};

/** 按引用 ID 查找来源节点和输出；sourceNodes 优先，未命中时回退到当前节点表。 */
export const getWorkflowReferenceSource = ({
  value,
  sourceNodes,
  getNodeById
}: {
  value: unknown;
  sourceNodes?: WorkflowReferenceSourceNode[];
  getNodeById?: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) => {
  if (!isWorkflowReferenceItem(value)) return {};

  const [sourceNodeId, outputId] = value;
  const sourceNode =
    sourceNodes?.find((node) => node.nodeId === sourceNodeId) ?? getNodeById?.(sourceNodeId);
  const sourceOutput = sourceNode?.outputs.find((output) => output.id === outputId);

  return {
    sourceNode,
    sourceOutput,
    sourceLabel: sourceNode
      ? 'name' in sourceNode
        ? sourceNode.name
        : sourceNode.sourceLabel
      : undefined
  };
};

/**
 * 判断单项引用状态。输出可用性优先于来源范围，保证失效输出不会被误报为不可达。
 * 普通来源按 sourceNodes 判断范围；global reference 单独按 chatConfig 查询。
 */
export const getWorkflowReferenceStatus = ({
  value,
  valueType,
  sourceNodes,
  getNodeById,
  chatConfig
}: GetWorkflowReferenceStatusProps): WorkflowReferenceStatus => {
  if (!isConfiguredReferenceValue(value)) return { code: 'empty' };
  if (!isWorkflowReferenceItem(value)) return { code: 'invalid_reference' };

  const [sourceNodeId, outputId] = value;
  const source = getWorkflowReferenceSource({
    value,
    sourceNodes,
    getNodeById
  });

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

    if (!source.sourceNode) return { code: 'valid' };
  }

  const { sourceNode, sourceOutput } = source;
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
    sourceNodes &&
    !sourceNodes.some((node) => node.nodeId === sourceNodeId)
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

/** 工作流变更后只保留仍被引用、且来源节点或输出已删除的历史展示快照。 */
export const captureDeletedWorkflowReferenceSnapshots = ({
  previousNodes,
  nextNodes,
  previousChatConfig,
  nextChatConfig,
  globalVariableSourceLabel
}: {
  previousNodes: Node<FlowNodeItemType, string | undefined>[];
  nextNodes: Node<FlowNodeItemType, string | undefined>[];
  previousChatConfig?: AppChatConfigType;
  nextChatConfig?: AppChatConfigType;
  globalVariableSourceLabel?: string;
}) => {
  const buildSourceNodes = (
    nodes: Node<FlowNodeItemType, string | undefined>[],
    chatConfig: AppChatConfigType | undefined
  ): WorkflowReferenceSourceNode[] => [
    ...nodes.map(({ data }) => ({
      nodeId: data.nodeId,
      sourceLabel: data.name,
      outputs: data.outputs,
      catchError: data.catchError
    })),
    {
      nodeId: VARIABLE_NODE_ID,
      sourceLabel: globalVariableSourceLabel,
      outputs: getWorkflowGlobalVariables({ chatConfig: chatConfig ?? {} }).map((variable) => ({
        id: variable.key,
        key: variable.key,
        type: FlowNodeOutputTypeEnum.static,
        valueType: variable.valueType,
        label: variable.label
      }))
    }
  ];

  const previousSourceNodes = buildSourceNodes(previousNodes, previousChatConfig);
  const nextSourceNodes = buildSourceNodes(nextNodes, nextChatConfig);

  const updateOptional = (item: any, key: string, value: any) => {
    if (isEqual(item[key], value)) return item;

    const nextItem = { ...item };
    if (value === undefined) {
      delete nextItem[key];
    } else {
      nextItem[key] = value;
    }
    return nextItem;
  };

  const getExistingSnapshot = (
    reference: ReferenceItemValueType,
    snapshots?: WorkflowReferenceSnapshot[]
  ) =>
    snapshots?.find(
      (snapshot) =>
        isWorkflowReferenceItem(snapshot.reference) &&
        snapshot.reference[0] === reference[0] &&
        snapshot.reference[1] === reference[1]
    );

  const captureSnapshot = (
    reference: unknown,
    existingSnapshot?: WorkflowReferenceSnapshot
  ): WorkflowReferenceSnapshot | undefined => {
    if (!isWorkflowReferenceItem(reference)) return undefined;

    const nextSource = getWorkflowReferenceSource({
      value: reference,
      sourceNodes: nextSourceNodes
    });
    if (nextSource.sourceOutput) return undefined;

    const previousSource = getWorkflowReferenceSource({
      value: reference,
      sourceNodes: previousSourceNodes
    });
    const source = previousSource.sourceOutput
      ? {
          sourceLabel: previousSource.sourceLabel,
          outputLabel: previousSource.sourceOutput.label
        }
      : existingSnapshot
        ? {
            sourceLabel: existingSnapshot.sourceLabel,
            outputLabel: existingSnapshot.outputLabel
          }
        : undefined;

    return source ? { reference, ...source } : undefined;
  };

  const captureSnapshots = (value: unknown, existingSnapshots?: WorkflowReferenceSnapshot[]) => {
    const snapshots = getWorkflowReferenceItems(value)
      .map((reference) =>
        captureSnapshot(reference, getExistingSnapshot(reference, existingSnapshots))
      )
      .filter((snapshot): snapshot is WorkflowReferenceSnapshot => !!snapshot);

    return snapshots.length > 0 ? snapshots : undefined;
  };

  const captureInput = (input: FlowNodeInputItemType): FlowNodeInputItemType => {
    let nextInput: FlowNodeInputItemType = nodeInputIsReference(input)
      ? updateOptional(
          input,
          'referenceSnapshots',
          captureSnapshots(input.value, input.referenceSnapshots)
        )
      : updateOptional(input, 'referenceSnapshots', undefined);

    if (input.key === NodeInputKeyEnum.ifElseList && Array.isArray(input.value)) {
      const nextValue = (input.value as IfElseListItemType[]).map((branch) => {
        let branchChanged = false;
        const nextList = branch.list.map((condition) => {
          const nextCondition = updateOptional(
            updateOptional(
              condition,
              'variableSnapshot',
              captureSnapshot(condition.variable, condition.variableSnapshot)
            ),
            'valueSnapshot',
            condition.valueType === 'reference'
              ? captureSnapshot(condition.value, condition.valueSnapshot)
              : undefined
          );
          branchChanged ||= nextCondition !== condition;
          return nextCondition;
        });

        if (!branchChanged) return branch;
        return { ...branch, list: nextList };
      });

      if (
        nextValue.some((branch, index) => branch !== (input.value as IfElseListItemType[])[index])
      ) {
        nextInput = { ...nextInput, value: nextValue };
      }
    }

    if (input.key === NodeInputKeyEnum.updateList && Array.isArray(input.value)) {
      const nextValue = (input.value as TUpdateListItem[]).map((item) => {
        let nextItem = updateOptional(
          item,
          'variableSnapshot',
          captureSnapshot(item.variable, item.variableSnapshot)
        );
        nextItem = updateOptional(
          nextItem,
          'valueReferenceSnapshots',
          item.renderType === FlowNodeInputTypeEnum.reference
            ? captureSnapshots(item.value, item.valueReferenceSnapshots)
            : undefined
        );
        return nextItem;
      });

      if (nextValue.some((item, index) => item !== (input.value as TUpdateListItem[])[index])) {
        nextInput = { ...nextInput, value: nextValue };
      }
    }

    return nextInput;
  };

  let changed = false;
  const result = nextNodes.map((node) => {
    const inputs = node.data.inputs.map(captureInput);
    if (inputs.every((input, index) => input === node.data.inputs[index])) return node;

    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        inputs
      }
    };
  });

  return changed ? result : nextNodes;
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
        getNodeById: () => undefined,
        chatConfig
      }).code === 'valid'
  );
