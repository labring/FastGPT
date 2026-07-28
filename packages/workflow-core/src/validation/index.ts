import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/core/workflow/utils';
import { WorkflowDocumentSchema, type WorkflowDocument } from '../domain/document';
import { WorkflowCommandError, type WorkflowDiagnostic } from '../domain/diagnostic';
import { assertExecutionEdge } from '../edge/service';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { assertParentAssignment } from '../nesting/service';
import { valueMatchesType } from '../reference/service';
import { getInputAutomationMeta } from '../template/automationMeta';
import { inputValueNeedsSchema, valueMatchesSchema } from '../template/valueSchema';

const isReferenceValue = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string';

const hasRequiredValue = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  (!Array.isArray(value) || value.length > 0);

const getReachableNodeIds = (document: WorkflowDocument, startNodeId: string) => {
  const reachable = new Set([startNodeId]);
  const pending = [startNodeId];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const edge of document.executionEdges) {
      if (edge.source.nodeId !== current || reachable.has(edge.target.nodeId)) continue;
      reachable.add(edge.target.nodeId);
      pending.push(edge.target.nodeId);
    }
  }
  return reachable;
};

const validateReference = ({
  document,
  node,
  input,
  diagnostics
}: {
  document: WorkflowDocument;
  node: StoreNodeItemType;
  input: StoreNodeItemType['inputs'][number];
  diagnostics: WorkflowDiagnostic[];
}) => {
  const references = isReferenceValue(input.value)
    ? [input.value]
    : Array.isArray(input.value) && input.value.every(isReferenceValue)
      ? input.value
      : undefined;
  if (!references) {
    diagnostics.push({
      code: 'WORKFLOW_REFERENCE_FORMAT_INVALID',
      severity: 'error',
      nodeId: node.nodeId,
      inputKey: input.key
    });
    return;
  }
  for (const [sourceNodeId, outputKey] of references) {
    if (sourceNodeId === VARIABLE_NODE_ID) {
      const variable = document.chatConfig.variables?.find((item) => item.key === outputKey);
      if (!variable) {
        diagnostics.push({
          code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key,
          params: { sourceNodeId, outputKey }
        });
      } else if (
        !areWorkflowValueTypesCompatible({
          expected: input.valueType,
          actual: variable.valueType
        })
      ) {
        diagnostics.push({
          code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key,
          params: { expected: input.valueType, actual: variable.valueType }
        });
      }
      continue;
    }

    const sourceNode = document.nodes.find((item) => item.nodeId === sourceNodeId);
    const sourceOutput = sourceNode?.outputs.find(
      (output) => output.key === outputKey || output.id === outputKey
    );
    if (!sourceNode || !sourceOutput) {
      diagnostics.push({
        code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key,
        params: { sourceNodeId, outputKey }
      });
      continue;
    }
    if (
      !areWorkflowValueTypesCompatible({
        expected: input.valueType,
        actual: sourceOutput.valueType
      })
    ) {
      diagnostics.push({
        code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key,
        params: { expected: input.valueType, actual: sourceOutput.valueType }
      });
    }

    const downstream = getReachableNodeIds(document, sourceNodeId);
    if (sourceNodeId === node.nodeId || !downstream.has(node.nodeId)) {
      diagnostics.push({
        code: 'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key,
        params: { sourceNodeId }
      });
    }
  }
};

const validateNodeIO = ({
  document,
  node,
  diagnostics
}: {
  document: WorkflowDocument;
  node: StoreNodeItemType;
  diagnostics: WorkflowDiagnostic[];
}) => {
  const inputKeys = new Set<string>();
  for (const input of node.inputs) {
    if (inputKeys.has(input.key)) {
      diagnostics.push({
        code: 'WORKFLOW_INPUT_KEY_DUPLICATED',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
    }
    inputKeys.add(input.key);

    const selectedTypeIndex = input.selectedTypeIndex ?? 0;
    const selectedType = input.renderTypeList[selectedTypeIndex];
    if (selectedType === undefined) {
      diagnostics.push({
        code: 'WORKFLOW_INPUT_MODE_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      continue;
    }
    const isUnusedConditionalLoopArray =
      node.flowNodeType === FlowNodeTypeEnum.loopRun &&
      input.key === NodeInputKeyEnum.loopRunInputArray &&
      node.inputs.find((item) => item.key === NodeInputKeyEnum.loopRunMode)?.value ===
        LoopRunModeEnum.conditional;
    const defaultPolicy = getInputAutomationMeta(node.flowNodeType, input.key)?.defaultPolicy;
    const isExternalBinding =
      defaultPolicy === 'userRequired' || defaultPolicy === 'remoteValidated';
    if (
      node.flowNodeType !== FlowNodeTypeEnum.workflowStart &&
      input.required === true &&
      !isUnusedConditionalLoopArray &&
      !isExternalBinding &&
      !hasRequiredValue(input.value)
    ) {
      diagnostics.push({
        code: 'WORKFLOW_REQUIRED_INPUT_MISSING',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      continue;
    }
    if (!hasRequiredValue(input.value)) continue;

    if (selectedType === FlowNodeInputTypeEnum.reference) {
      validateReference({ document, node, input, diagnostics });
    } else if (!valueMatchesType(input.value, input.valueType)) {
      diagnostics.push({
        code: 'WORKFLOW_INPUT_VALUE_TYPE_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key,
        params: { expected: input.valueType }
      });
    } else {
      const valueSchema = getInputAutomationMeta(node.flowNodeType, input.key)?.valueSchema;
      if (valueSchema && !valueMatchesSchema(input.value, valueSchema)) {
        diagnostics.push({
          code: 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key
        });
      } else if (
        !valueSchema &&
        inputValueNeedsSchema({ value: input.value, valueType: input.valueType })
      ) {
        diagnostics.push({
          code: 'WORKFLOW_TEMPLATE_PARAMETER_SCHEMA_MISSING',
          severity: 'warning',
          nodeId: node.nodeId,
          inputKey: input.key
        });
      }
    }
  }

  const outputKeys = new Set<string>();
  for (const output of node.outputs) {
    if (outputKeys.has(output.key)) {
      diagnostics.push({
        code: 'WORKFLOW_OUTPUT_KEY_DUPLICATED',
        severity: 'error',
        nodeId: node.nodeId,
        params: { outputKey: output.key }
      });
    }
    outputKeys.add(output.key);
  }
};

const reachabilityIgnoredNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.systemConfig,
  FlowNodeTypeEnum.pluginConfig,
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.emptyNode
]);

const validateContainer = ({
  document,
  node,
  diagnostics
}: {
  document: WorkflowDocument;
  node: StoreNodeItemType;
  diagnostics: WorkflowDiagnostic[];
}) => {
  if (!isNestedParentNodeType(node.flowNodeType)) return;
  const children = document.nodes.filter((item) => item.parentNodeId === node.nodeId);
  const listedChildren = node.inputs.find(
    (item) => item.key === NodeInputKeyEnum.childrenNodeIdList
  )?.value;
  const actualIds = children.map((item) => item.nodeId).sort();
  const listedIds = Array.isArray(listedChildren)
    ? listedChildren.filter((item): item is string => typeof item === 'string').sort()
    : [];
  if (JSON.stringify(actualIds) !== JSON.stringify(listedIds)) {
    diagnostics.push({
      code: 'WORKFLOW_CONTAINER_CHILDREN_OUT_OF_SYNC',
      severity: 'error',
      nodeId: node.nodeId
    });
  }

  const requiredSystemTypes =
    node.flowNodeType === FlowNodeTypeEnum.loopRun
      ? [FlowNodeTypeEnum.loopRunStart]
      : [FlowNodeTypeEnum.nestedStart, FlowNodeTypeEnum.nestedEnd];
  for (const systemType of requiredSystemTypes) {
    const count = children.filter((item) => item.flowNodeType === systemType).length;
    if (count !== 1) {
      diagnostics.push({
        code: 'WORKFLOW_CONTAINER_SYSTEM_CHILD_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        params: { systemType, count }
      });
    }
  }

  if (node.flowNodeType === FlowNodeTypeEnum.loopRun) {
    const mode = node.inputs.find((item) => item.key === NodeInputKeyEnum.loopRunMode)?.value;
    if (
      mode === LoopRunModeEnum.conditional &&
      !children.some((item) => item.flowNodeType === FlowNodeTypeEnum.loopRunBreak)
    ) {
      diagnostics.push({
        code: 'WORKFLOW_CONDITIONAL_LOOP_BREAK_REQUIRED',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }
};

const validateSpecialNode = ({
  document,
  node,
  diagnostics
}: {
  document: WorkflowDocument;
  node: StoreNodeItemType;
  diagnostics: WorkflowDiagnostic[];
}) => {
  const getInputValue = (key: NodeInputKeyEnum) =>
    node.inputs.find((item) => item.key === key)?.value;

  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    const branches = getInputValue(NodeInputKeyEnum.ifElseList);
    const invalid =
      !Array.isArray(branches) ||
      branches.length === 0 ||
      branches.some((branch) => {
        if (!branch || typeof branch !== 'object') return true;
        const list = (branch as { list?: unknown }).list;
        return (
          !Array.isArray(list) ||
          list.length === 0 ||
          list.some((condition) => {
            if (!condition || typeof condition !== 'object') return true;
            const value = condition as {
              variable?: unknown;
              condition?: VariableConditionEnum;
              value?: unknown;
            };
            return (
              value.variable === undefined ||
              value.condition === undefined ||
              (value.value === undefined &&
                value.condition !== VariableConditionEnum.isEmpty &&
                value.condition !== VariableConditionEnum.isNotEmpty)
            );
          })
        );
      });
    if (invalid) {
      diagnostics.push({
        code: 'WORKFLOW_BRANCH_CONFIGURATION_INVALID',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }

  if (
    node.flowNodeType === FlowNodeTypeEnum.userSelect ||
    node.flowNodeType === FlowNodeTypeEnum.classifyQuestion
  ) {
    const key =
      node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
    const options = getInputValue(key);
    const optionKeys = Array.isArray(options)
      ? options.map((item) =>
          item && typeof item === 'object' ? (item as { key?: unknown }).key : undefined
        )
      : [];
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      options.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          typeof (item as { key?: unknown }).key !== 'string' ||
          typeof (item as { value?: unknown }).value !== 'string' ||
          !(item as { value: string }).value
      ) ||
      new Set(optionKeys).size !== optionKeys.length
    ) {
      diagnostics.push({
        code: 'WORKFLOW_BRANCH_CONFIGURATION_INVALID',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }

  if (node.flowNodeType === FlowNodeTypeEnum.formInput) {
    const forms = getInputValue(NodeInputKeyEnum.userInputForms);
    const formKeys = Array.isArray(forms)
      ? forms.map((form) =>
          form && typeof form === 'object' ? (form as { key?: unknown }).key : undefined
        )
      : [];
    const hasInvalidField =
      !Array.isArray(forms) ||
      forms.length === 0 ||
      formKeys.some((key) => typeof key !== 'string' || !key) ||
      new Set(formKeys).size !== formKeys.length ||
      formKeys.some(
        (key) => typeof key === 'string' && !node.outputs.some((output) => output.key === key)
      );
    if (hasInvalidField) {
      diagnostics.push({
        code: 'WORKFLOW_FORM_INPUT_CONFIGURATION_INVALID',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }

  if (node.flowNodeType === FlowNodeTypeEnum.toolCall) {
    const hasTool = document.executionEdges.some(
      (edge) => edge.source.kind === 'selectedTools' && edge.source.nodeId === node.nodeId
    );
    const usesSandbox = getInputValue(NodeInputKeyEnum.useAgentSandbox) === true;
    if (!hasTool && !usesSandbox) {
      diagnostics.push({
        code: 'WORKFLOW_TOOL_REQUIRED',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }
};

/** 共享 Validator：覆盖线性、分支、工具、动态 IO 和嵌套工作流。 */
export const validateWorkflow = (document: WorkflowDocument): WorkflowDiagnostic[] => {
  const schemaResult = WorkflowDocumentSchema.safeParse(document);
  if (!schemaResult.success) {
    return schemaResult.error.issues.map((issue) => ({
      code: 'WORKFLOW_SCHEMA_INVALID',
      severity: 'error' as const,
      path: issue.path.map((item) => (typeof item === 'symbol' ? item.toString() : item))
    }));
  }

  const diagnostics: WorkflowDiagnostic[] = [];
  const nodeIds = new Set<string>();
  for (const node of document.nodes) {
    if (nodeIds.has(node.nodeId)) {
      diagnostics.push({
        code: 'WORKFLOW_NODE_ID_DUPLICATED',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
    nodeIds.add(node.nodeId);
  }

  const systemConfigNodes = document.nodes.filter(
    (node) => node.flowNodeType === FlowNodeTypeEnum.systemConfig
  );
  if (systemConfigNodes.length > 1) {
    diagnostics.push({
      code: 'WORKFLOW_SYSTEM_CONFIG_NODE_DUPLICATED',
      severity: 'error',
      params: { count: systemConfigNodes.length }
    });
  }

  for (const node of document.nodes) {
    if (node.parentNodeId && !nodeIds.has(node.parentNodeId)) {
      diagnostics.push({
        code: 'WORKFLOW_PARENT_NODE_NOT_FOUND',
        severity: 'error',
        nodeId: node.nodeId,
        params: { parentNodeId: node.parentNodeId }
      });
    }
    if (node.parentNodeId) {
      const parent = document.nodes.find((item) => item.nodeId === node.parentNodeId);
      if (parent) {
        try {
          assertParentAssignment({
            document,
            node,
            parentNodeId: node.parentNodeId,
            allowSystemChild: isNestedChildSystemNodeType(node.flowNodeType)
          });
        } catch (error) {
          if (error instanceof WorkflowCommandError) diagnostics.push(...error.diagnostics);
        }
      }
    } else if (
      node.flowNodeType === FlowNodeTypeEnum.loopRunBreak ||
      isNestedChildSystemNodeType(node.flowNodeType)
    ) {
      diagnostics.push({
        code: 'WORKFLOW_SYSTEM_OR_BREAK_PARENT_REQUIRED',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
    if (node.pluginData?.error) {
      diagnostics.push({
        code: 'WORKFLOW_NODE_CONFIGURATION_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        params: { error: node.pluginData.error }
      });
    }
    validateNodeIO({ document, node, diagnostics });
    validateSpecialNode({ document, node, diagnostics });
    validateContainer({ document, node, diagnostics });
  }

  const startNodes = document.nodes.filter(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  );
  if (startNodes.length !== 1) {
    diagnostics.push({
      code: 'WORKFLOW_START_COUNT_INVALID',
      severity: 'error',
      params: { count: startNodes.length }
    });
  }

  const edgeKeys = new Set<string>();
  for (const edge of document.executionEdges) {
    const edgeKey = JSON.stringify(edge);
    if (edgeKeys.has(edgeKey)) {
      diagnostics.push({ code: 'WORKFLOW_EDGE_DUPLICATED', severity: 'error', params: { edge } });
    }
    edgeKeys.add(edgeKey);
    try {
      assertExecutionEdge(document, edge);
    } catch (error) {
      if (error instanceof WorkflowCommandError) diagnostics.push(...error.diagnostics);
      diagnostics.push({ code: 'WORKFLOW_EDGE_INVALID', severity: 'error', params: { edge } });
    }
  }

  const startNode = startNodes[0];
  if (startNode) {
    const reachableNodeIds = getReachableNodeIds(document, startNode.nodeId);
    for (const node of document.nodes) {
      if (
        !reachabilityIgnoredNodeTypes.has(node.flowNodeType) &&
        !node.parentNodeId &&
        !reachableNodeIds.has(node.nodeId)
      ) {
        diagnostics.push({
          code: 'WORKFLOW_NODE_NOT_REACHABLE',
          severity: 'error',
          nodeId: node.nodeId
        });
      }
    }
  }

  return diagnostics;
};
