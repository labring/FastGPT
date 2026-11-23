import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  areWorkflowValueTypesCompatible,
  filterSelectableWorkflowNodeOutputs,
  getHandleId,
  getSelectedInputRenderType,
  isWorkflowErrorBranchReachable,
  isWorkflowReferenceEdgeValid,
  getWorkflowReferenceSourceNodes,
  getWorkflowReferenceVariables
} from '@fastgpt/global/common/workflow/reference';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { WorkflowCommandError } from '../domain/diagnostic';
import type { VariableRef } from './type';
import { getInputAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';
import { getNodeInputCapability, type NodeParameterInputMode } from '../template/descriptor';
import { assertValueSchema, getNodeInputValueSchema } from '../template/valueSchema';
import { getWorkflowInputValueForValidation } from '../template/inputValue';
import {
  getWorkflowSecretInputKind,
  inputTypeValueTypeMap
} from '@fastgpt/global/common/workflow/input';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';

export type WorkflowReferenceValue = [string, string];

/** 提取 Secret 容器里的引用，并按内部输入类型返回校验目标。 */
export const getWorkflowSecretReferences = ({
  flowNodeType,
  input
}: {
  flowNodeType: unknown;
  input: FlowNodeInputItemType;
}) => {
  const kind = getWorkflowSecretInputKind({ flowNodeType, inputKey: input.key });
  if (!kind) return [];
  if (
    kind === 'systemConfig' &&
    (!input.value ||
      typeof input.value !== 'object' ||
      Array.isArray(input.value) ||
      !('type' in input.value) ||
      input.value.type !== 'manual')
  ) {
    return [];
  }

  const source =
    kind === 'systemConfig' &&
    typeof input.value === 'object' &&
    input.value !== null &&
    !Array.isArray(input.value) &&
    'type' in input.value &&
    input.value.type === 'manual' &&
    typeof input.value.value === 'object' &&
    input.value.value !== null &&
    !Array.isArray(input.value.value)
      ? input.value.value
      : input.value;
  if (typeof source !== 'object' || source === null) return [];

  return Object.entries(source).flatMap(([key, value]) => {
    const reference = getSecretReferenceValue(value);
    if (!reference) return [];
    const inputType =
      kind === 'systemConfig'
        ? input.inputList?.find((item) => item.key === key)?.inputType
        : 'secret';
    return [
      {
        value: reference,
        valueType: inputType ? inputTypeValueTypeMap[inputType] : WorkflowIOValueTypeEnum.string
      }
    ];
  });
};

/** 判断单个引用元组的结构；来源是否存在由引用校验统一判断。 */
export const isWorkflowReferenceValue = (value: unknown): value is WorkflowReferenceValue =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string';

/**
 * 解析单引用或一层引用数组，返回原始引用元组以供校验和安全重写。
 * 普通数组与非法结构返回 undefined，避免被误判为工作流引用。
 */
export const getWorkflowReferenceValues = (
  value: unknown
): WorkflowReferenceValue[] | undefined => {
  if (isWorkflowReferenceValue(value)) return [value];
  if (Array.isArray(value) && value.every(isWorkflowReferenceValue)) return value;
  return undefined;
};

type WorkflowReferenceIndex = {
  nodesById: ReadonlyMap<string, WorkflowDocument['nodes'][number]>;
  incomingEdgesByNodeId: ReadonlyMap<string, readonly StoreEdgeItemType[]>;
  parentByNodeId: ReadonlyMap<string, string>;
};

const getExecutionSourceHandle = (source: WorkflowDocument['executionEdges'][number]['source']) => {
  if (source.kind === 'next') return getHandleId(source.nodeId, 'source', 'right');
  if (source.kind === 'catch') return getHandleId(source.nodeId, 'source_catch', 'right');
  if (source.kind === 'selectedTools') return NodeOutputKeyEnum.selectedTools;
  if (source.kind === 'branch') return getHandleId(source.nodeId, 'source', source.branchKey);
  return getHandleId(source.nodeId, 'source', source.outputKey);
};

/** 将语义边投影为与编辑器相同的有效入边，供普通引用和异常引用共用。 */
export const createWorkflowReferenceIndex = (
  document: Pick<WorkflowDocument, 'nodes' | 'executionEdges'>
): WorkflowReferenceIndex => {
  const nodesById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const parentByNodeId = new Map(
    document.nodes.flatMap((node) =>
      node.parentNodeId ? [[node.nodeId, node.parentNodeId] as const] : []
    )
  );
  const incomingEdgesByNodeId = new Map<string, StoreEdgeItemType[]>();

  for (const edge of document.executionEdges) {
    const source = edge.source.nodeId;
    const target = edge.target.nodeId;
    const sourceHandle = getExecutionSourceHandle(edge.source);
    if (
      !isWorkflowReferenceEdgeValid({
        source: nodesById.get(source),
        target: nodesById.get(target),
        sourceHandle
      })
    ) {
      continue;
    }

    const incomingEdges = incomingEdgesByNodeId.get(target) ?? [];
    incomingEdges.push({
      source,
      target,
      sourceHandle,
      targetHandle:
        edge.target.kind === 'selectedTools'
          ? NodeOutputKeyEnum.selectedTools
          : getHandleId(target, 'target', 'left')
    });
    incomingEdgesByNodeId.set(target, incomingEdges);
  }

  return { nodesById, incomingEdgesByNodeId, parentByNodeId };
};

/** 沿有效入边查找普通引用来源，并为可编辑的容器输出保留直接子节点。 */
export const getInputReferenceSourceNodes = ({
  referenceIndex,
  nodeId,
  input
}: {
  referenceIndex: WorkflowReferenceIndex;
  nodeId: string;
  input: FlowNodeInputItemType;
}) =>
  getWorkflowReferenceSourceNodes({
    nodeId,
    getNodeById: (id) => referenceIndex.nodesById.get(id),
    getIncomingEdges: (id) => referenceIndex.incomingEdgesByNodeId.get(id) ?? [],
    includeChildren: input.canEdit === true,
    getChildNodeIds: (id) =>
      [...referenceIndex.nodesById.values()]
        .filter((node) => node.parentNodeId === id)
        .map((node) => node.nodeId)
  });

/** 错误输出沿 catch 路径传播，LoopRun 的自定义输出还可读取直接子节点的捕获结果。 */
export const isWorkflowReferenceOutputUpstream = ({
  nodeId,
  sourceNodeId,
  isErrorOutput,
  referenceIndex,
  allowLoopRunChildSource
}: {
  nodeId: string;
  sourceNodeId: string;
  isErrorOutput: boolean;
  referenceIndex: WorkflowReferenceIndex;
  allowLoopRunChildSource?: boolean;
}) => {
  if (!isErrorOutput) return true;
  if (
    allowLoopRunChildSource &&
    referenceIndex.parentByNodeId.get(sourceNodeId) === nodeId &&
    referenceIndex.nodesById.get(nodeId)?.flowNodeType === FlowNodeTypeEnum.loopRun
  )
    return true;
  return isWorkflowErrorBranchReachable({
    sourceNodeId,
    targetNodeId: nodeId,
    parentByNodeId: referenceIndex.parentByNodeId,
    getIncomingEdges: (targetId) => referenceIndex.incomingEdgesByNodeId.get(targetId) ?? []
  });
};

export const getInput = ({
  document,
  nodeId,
  inputKey
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
}) => {
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.nodeNotFound, severity: 'error', nodeId }
    ]);
  }
  const input = node.inputs.find((item) => item.key === inputKey);
  if (!input) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.inputNotFound, severity: 'error', nodeId, inputKey }
    ]);
  }
  const automationMeta = getInputAutomationMeta(node.flowNodeType, inputKey);
  const capability = getNodeInputCapability({ input, automationMeta });
  if (!capability.configurable) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.inputNotConfigurable, severity: 'error', nodeId, inputKey }
    ]);
  }
  return { input, inputModes: capability.inputModes };
};

const isLiteralInputRenderType = (type: FlowNodeInputTypeEnum) =>
  type !== FlowNodeInputTypeEnum.reference && type !== FlowNodeInputTypeEnum.agentGenerated;

export const valueMatchesType = (value: unknown, valueType?: string): boolean => {
  if (valueType === undefined || valueType === WorkflowIOValueTypeEnum.any) return true;
  if (valueType === WorkflowIOValueTypeEnum.string) return typeof value === 'string';
  if (valueType === WorkflowIOValueTypeEnum.number) return typeof value === 'number';
  if (valueType === WorkflowIOValueTypeEnum.boolean) return typeof value === 'boolean';
  if (valueType === WorkflowIOValueTypeEnum.object) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  if (valueType === WorkflowIOValueTypeEnum.arrayString) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
  if (valueType === WorkflowIOValueTypeEnum.arrayNumber) {
    return Array.isArray(value) && value.every((item) => typeof item === 'number');
  }
  if (valueType === WorkflowIOValueTypeEnum.arrayBoolean) {
    return Array.isArray(value) && value.every((item) => typeof item === 'boolean');
  }
  if (
    valueType === WorkflowIOValueTypeEnum.arrayObject ||
    valueType === WorkflowIOValueTypeEnum.arrayAny ||
    valueType === WorkflowIOValueTypeEnum.chatHistory ||
    valueType === WorkflowIOValueTypeEnum.datasetQuote
  ) {
    return Array.isArray(value) || typeof value === 'number';
  }
  return true;
};

export const assertInputMode = ({
  inputKey,
  inputModes,
  nodeId,
  mode
}: {
  inputKey: string;
  inputModes: NodeParameterInputMode[];
  nodeId: string;
  mode: 'literal' | 'reference';
}) => {
  if (!inputModes.includes(mode)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.inputModeNotAllowed,
        severity: 'error',
        nodeId,
        inputKey,
        params: { mode }
      }
    ]);
  }
};

/** 切换输入模式；当前工作流只持久化 selectedType。 */
const setSelectedInputRenderType = (
  input: FlowNodeInputItemType,
  selectedType: FlowNodeInputTypeEnum
) => {
  input.selectedType = selectedType;
};

/** 更新固定值并同步 Web 输入模式；授权写入规范化结果，标签过滤等编辑器保留原始存储结构。 */
export const setInputValue = ({
  document,
  nodeId,
  inputKey,
  value
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
  value: unknown;
}) => {
  const { input, inputModes } = getInput({ document, nodeId, inputKey });
  assertInputMode({ inputKey, inputModes, nodeId, mode: 'literal' });
  const currentSelectedType = getSelectedInputRenderType(input);
  const literalType =
    currentSelectedType &&
    input.renderTypeList.includes(currentSelectedType) &&
    isLiteralInputRenderType(currentSelectedType)
      ? currentSelectedType
      : input.renderTypeList.find(isLiteralInputRenderType)!;
  const effectiveValue = getWorkflowInputValueForValidation({
    input: { ...input, selectedType: literalType },
    value
  });
  if (!valueMatchesType(effectiveValue, input.valueType)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.inputValueTypeInvalid,
        severity: 'error',
        nodeId,
        inputKey,
        params: { expected: input.valueType }
      }
    ]);
  }
  const valueSchema = getNodeInputValueSchema({
    input,
    automationMeta: getInputAutomationMeta(
      document.nodes.find((item) => item.nodeId === nodeId)!.flowNodeType,
      inputKey
    )
  });
  if (valueSchema)
    assertValueSchema({ value: effectiveValue, schema: valueSchema, nodeId, inputKey });

  input.value = structuredClone(
    input.key === NodeInputKeyEnum.systemInputConfig ? effectiveValue : value
  );
  setSelectedInputRenderType(input, literalType);
};

/** 设置基础节点输出引用，WorkflowDocument 使用稳定的 `[nodeId, outputKey]` 语义格式。 */
export const setInputReference = ({
  document,
  nodeId,
  inputKey,
  ref
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
  ref: VariableRef;
}) => {
  const { input, inputModes } = getInput({ document, nodeId, inputKey });
  assertInputMode({ inputKey, inputModes, nodeId, mode: 'reference' });

  if (ref.nodeId === VARIABLE_NODE_ID) {
    const variable = getWorkflowReferenceVariables({ chatConfig: document.chatConfig }).find(
      (item) => item.key === ref.outputKey
    );
    if (!variable) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound,
          severity: 'error',
          nodeId,
          inputKey,
          params: ref
        }
      ]);
    }
    if (
      !areWorkflowValueTypesCompatible({
        expected: input.valueType,
        actual: variable.valueType
      })
    ) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
          severity: 'error',
          nodeId,
          inputKey,
          params: { expected: input.valueType, actual: variable.valueType }
        }
      ]);
    }
    input.value = [ref.nodeId, ref.outputKey];
    setSelectedInputRenderType(
      input,
      input.renderTypeList.includes(FlowNodeInputTypeEnum.settingDatasetQuotePrompt)
        ? FlowNodeInputTypeEnum.settingDatasetQuotePrompt
        : FlowNodeInputTypeEnum.reference
    );
    return;
  }

  const sourceNode = document.nodes.find((item) => item.nodeId === ref.nodeId);
  const sourceOutput = sourceNode
    ? filterSelectableWorkflowNodeOutputs({
        outputs: sourceNode.outputs,
        catchError: sourceNode.catchError
      }).find((output) => output.key === ref.outputKey)
    : undefined;
  if (!sourceNode || !sourceOutput) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound,
        severity: 'error',
        nodeId,
        inputKey,
        params: ref
      }
    ]);
  }

  const referenceIndex = createWorkflowReferenceIndex(document);
  const sourceIsVisible = getInputReferenceSourceNodes({ referenceIndex, nodeId, input }).some(
    (node) => node.nodeId === sourceNode.nodeId
  );
  if (
    !sourceIsVisible ||
    !isWorkflowReferenceOutputUpstream({
      referenceIndex,
      nodeId,
      sourceNodeId: sourceNode.nodeId,
      isErrorOutput: sourceOutput.type === FlowNodeOutputTypeEnum.error,
      allowLoopRunChildSource: input.canEdit === true && sourceNode.catchError === true
    })
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream,
        severity: 'error',
        nodeId,
        inputKey,
        params: {
          ...ref,
          targetNodeId: nodeId,
          reason:
            sourceNode.nodeId === nodeId
              ? 'Self-reference is not allowed'
              : 'Source output is outside the reference scope of the target input.',
          remediation:
            "For nodes in the same scope, connect the upstream source using 'edge.connect' before referencing it. Otherwise use a visible parent-container source; container outputs may reference their own children. Do not add cross-scope execution edges."
        }
      }
    ]);
  }
  if (
    !areWorkflowValueTypesCompatible({
      expected: input.valueType,
      actual: sourceOutput.valueType
    })
  ) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
        severity: 'error',
        nodeId,
        inputKey,
        params: { expected: input.valueType, actual: sourceOutput.valueType }
      }
    ]);
  }

  input.value = [ref.nodeId, ref.outputKey];
  setSelectedInputRenderType(
    input,
    input.renderTypeList.includes(FlowNodeInputTypeEnum.settingDatasetQuotePrompt)
      ? FlowNodeInputTypeEnum.settingDatasetQuotePrompt
      : FlowNodeInputTypeEnum.reference
  );
};

/** 清空可选且可配置的节点输入。 */
export const unsetInput = ({
  document,
  nodeId,
  inputKey
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
}) => {
  const { input } = getInput({ document, nodeId, inputKey });
  if (input.required === true) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.requiredInputUnsetForbidden,
        severity: 'error',
        nodeId,
        inputKey
      }
    ]);
  }
  input.value = undefined;
};
