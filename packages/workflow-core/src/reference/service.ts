import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  areWorkflowValueTypesCompatible,
  getSelectedInputRenderType,
  getWorkflowReferenceSourceNodes,
  getWorkflowReferenceVariables
} from '@fastgpt/global/common/workflow/reference';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import type { VariableRef } from './type';
import { getInputAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';
import { getNodeInputCapability, type NodeParameterInputMode } from '../template/descriptor';
import { assertValueSchema, inputValueNeedsSchema } from '../template/valueSchema';

export type WorkflowReferenceValue = [string, string];

const isWorkflowReferenceValue = (value: unknown): value is WorkflowReferenceValue =>
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

/** 将领域图投影到共享引用规则；只有可编辑的容器输出允许引用直接子节点。 */
export const getInputReferenceSourceNodes = ({
  document,
  nodeId,
  input
}: {
  document: WorkflowDocument;
  nodeId: string;
  input: FlowNodeInputItemType;
}) => {
  const nodesById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  return getWorkflowReferenceSourceNodes({
    nodeId,
    getNodeById: (id) => nodesById.get(id),
    edges: document.executionEdges.map((edge) => ({
      source: edge.source.nodeId,
      target: edge.target.nodeId
    })),
    includeChildren: input.canEdit === true,
    childrenNodeIdListMap: {
      [nodeId]: document.nodes
        .filter((node) => node.parentNodeId === nodeId)
        .map((node) => node.nodeId)
    }
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
      { code: 'WORKFLOW_NODE_NOT_FOUND', severity: 'error', nodeId }
    ]);
  }
  const input = node.inputs.find((item) => item.key === inputKey);
  if (!input) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_INPUT_NOT_FOUND', severity: 'error', nodeId, inputKey }
    ]);
  }
  const automationMeta = getInputAutomationMeta(node.flowNodeType, inputKey);
  const capability = getNodeInputCapability({ input, automationMeta });
  if (!capability.configurable) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_INPUT_NOT_CONFIGURABLE', severity: 'error', nodeId, inputKey }
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
        code: 'WORKFLOW_INPUT_MODE_NOT_ALLOWED',
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

/** 更新固定值，并同步 Web 使用的输入模式字段。 */
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
  if (!valueMatchesType(value, input.valueType)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_INPUT_VALUE_TYPE_INVALID',
        severity: 'error',
        nodeId,
        inputKey,
        params: { expected: input.valueType }
      }
    ]);
  }
  const valueSchema =
    getInputAutomationMeta(
      document.nodes.find((item) => item.nodeId === nodeId)!.flowNodeType,
      inputKey
    )?.valueSchema ?? input.customJsonSchema;
  const needsSchema = inputValueNeedsSchema({ value, valueType: input.valueType });
  if (needsSchema && !valueSchema) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_TEMPLATE_PARAMETER_SCHEMA_MISSING',
        severity: 'error',
        nodeId,
        inputKey
      }
    ]);
  }
  if (valueSchema) assertValueSchema({ value, schema: valueSchema, nodeId, inputKey });

  input.value = structuredClone(value);
  const currentSelectedType = getSelectedInputRenderType(input);
  const literalType =
    currentSelectedType &&
    input.renderTypeList.includes(currentSelectedType) &&
    isLiteralInputRenderType(currentSelectedType)
      ? currentSelectedType
      : input.renderTypeList.find(isLiteralInputRenderType)!;
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
          code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND',
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
          code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
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
  const sourceOutput = sourceNode?.outputs.find((output) => output.key === ref.outputKey);
  if (!sourceNode || !sourceOutput) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND',
        severity: 'error',
        nodeId,
        inputKey,
        params: ref
      }
    ]);
  }

  const sourceIsVisible = getInputReferenceSourceNodes({ document, nodeId, input }).some(
    (node) => node.nodeId === sourceNode.nodeId
  );
  if (!sourceIsVisible) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM',
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
        code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
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
      { code: 'WORKFLOW_REQUIRED_INPUT_UNSET_FORBIDDEN', severity: 'error', nodeId, inputKey }
    ]);
  }
  input.value = undefined;
};
