import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  areWorkflowValueTypesCompatible,
  getSelectedInputRenderType
} from '@fastgpt/global/core/workflow/utils';
import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import type { VariableRef } from './type';
import { getInputAutomationMeta } from '../template/automationMeta';
import { getNodeInputCapability, type NodeParameterInputMode } from '../template/descriptor';
import { assertValueSchema, inputValueNeedsSchema } from '../template/valueSchema';

const getInput = ({
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

const assertInputMode = ({
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

/** 同步新旧输入模式字段，避免 selectedType 覆盖 selectedTypeIndex 造成值与控件不一致。 */
const setSelectedInputRenderType = (
  input: FlowNodeInputItemType,
  selectedType: FlowNodeInputTypeEnum
) => {
  input.selectedType = selectedType;
  input.selectedTypeIndex = input.renderTypeList.indexOf(selectedType);
};

/** 更新固定值，并同步 Web 使用的新旧输入模式字段。 */
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
    const variable = document.chatConfig.variables?.find((item) => item.key === ref.outputKey);
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
    setSelectedInputRenderType(input, FlowNodeInputTypeEnum.reference);
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

  const reachableNodeIds = new Set([sourceNode.nodeId]);
  const pendingNodeIds = [sourceNode.nodeId];
  while (pendingNodeIds.length > 0) {
    const currentNodeId = pendingNodeIds.shift()!;
    for (const edge of document.executionEdges) {
      if (edge.source.nodeId !== currentNodeId || reachableNodeIds.has(edge.target.nodeId))
        continue;
      reachableNodeIds.add(edge.target.nodeId);
      pendingNodeIds.push(edge.target.nodeId);
    }
  }
  if (sourceNode.nodeId === nodeId || !reachableNodeIds.has(nodeId)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM',
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
  setSelectedInputRenderType(input, FlowNodeInputTypeEnum.reference);
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

/** 返回对指定输入类型兼容且在当前节点上游可达的输出和全局变量。 */
export const getAvailableInputReferences = ({
  document,
  nodeId,
  inputKey
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
}) => {
  const { input, inputModes } = getInput({ document, nodeId, inputKey });
  assertInputMode({ inputKey, inputModes, nodeId, mode: 'reference' });
  const upstreamNodeIds = new Set<string>();
  const pending = document.executionEdges
    .filter((edge) => edge.target.nodeId === nodeId)
    .map((edge) => edge.source.nodeId);
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (upstreamNodeIds.has(current)) continue;
    upstreamNodeIds.add(current);
    pending.push(
      ...document.executionEdges
        .filter((edge) => edge.target.nodeId === current)
        .map((edge) => edge.source.nodeId)
    );
  }

  const nodeOutputs = document.nodes
    .filter((node) => upstreamNodeIds.has(node.nodeId))
    .flatMap((node) =>
      node.outputs
        .filter(
          (output) =>
            input.valueType === undefined ||
            input.valueType === WorkflowIOValueTypeEnum.any ||
            output.valueType === undefined ||
            output.valueType === WorkflowIOValueTypeEnum.any ||
            areWorkflowValueTypesCompatible({
              expected: input.valueType,
              actual: output.valueType
            })
        )
        .map((output) => ({
          ref: { nodeId: node.nodeId, outputKey: output.key },
          label: output.label,
          valueType: output.valueType,
          source: 'node' as const
        }))
    );
  const variables = (document.chatConfig.variables ?? [])
    .filter(
      (variable) =>
        input.valueType === undefined ||
        input.valueType === WorkflowIOValueTypeEnum.any ||
        variable.valueType === undefined ||
        variable.valueType === WorkflowIOValueTypeEnum.any ||
        areWorkflowValueTypesCompatible({
          expected: input.valueType,
          actual: variable.valueType
        })
    )
    .map((variable) => ({
      ref: { nodeId: VARIABLE_NODE_ID, outputKey: variable.key },
      label: variable.label,
      valueType: variable.valueType,
      source: 'variable' as const
    }));
  return [...variables, ...nodeOutputs];
};
