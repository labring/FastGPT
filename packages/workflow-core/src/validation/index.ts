import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowDocumentSchema,
  type WorkflowDocument
} from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError, type WorkflowDiagnostic } from '../domain/diagnostic';
import { assertExecutionEdge } from '../edge/validation';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { assertParentAssignment } from '../nesting/service';
import { getWorkflowReferenceValues } from '../reference/service';
import { hasConfiguredValue } from '../template/defaultValue';
import { validateNodeIO } from './io';
import { checkWorkflowModels } from './model';

/** 多个入口共享一次图遍历；嵌套起点与工具输入节点遵循 Web 的入口语义。 */
const getReachableNodeIds = (document: WorkflowDocument, startNodeIds: string[]) => {
  const outgoing = new Map<string, string[]>();
  for (const edge of document.executionEdges) {
    const targets = outgoing.get(edge.source.nodeId) ?? [];
    targets.push(edge.target.nodeId);
    outgoing.set(edge.source.nodeId, targets);
  }
  const reachable = new Set(startNodeIds);
  const pending = [...reachable];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const target of outgoing.get(current) ?? []) {
      if (reachable.has(target)) continue;
      reachable.add(target);
      pending.push(target);
    }
  }
  return reachable;
};

/** 校验 Builder 生成的知识库问答链路是否把检索结果传入后续 AI 节点。 */
export const validateWorkflowBuilderSemantics = (
  document: WorkflowDocument
): WorkflowDiagnostic[] => {
  const datasetNodes = document.nodes.filter(
    (node) =>
      node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
      node.flowNodeType === FlowNodeTypeEnum.datasetConcatNode
  );
  const aiNodes = document.nodes.filter((node) => node.flowNodeType === FlowNodeTypeEnum.chatNode);

  return aiNodes.flatMap((aiNode) => {
    const upstreamDatasetNodeIds = new Set(
      datasetNodes
        .filter((datasetNode) =>
          getReachableNodeIds(document, [datasetNode.nodeId]).has(aiNode.nodeId)
        )
        .map((datasetNode) => datasetNode.nodeId)
    );
    if (upstreamDatasetNodeIds.size === 0) return [];

    const quoteInput = aiNode.inputs.find(
      (input) => input.key === NodeInputKeyEnum.aiChatDatasetQuote
    );
    const references = getWorkflowReferenceValues(quoteInput?.value);
    const hasUpstreamQuoteReference =
      references?.some(
        ([sourceNodeId, outputKey]) =>
          upstreamDatasetNodeIds.has(sourceNodeId) && outputKey === NodeOutputKeyEnum.datasetQuoteQA
      ) ?? false;
    if (hasUpstreamQuoteReference) return [];

    return [
      {
        code: 'WORKFLOW_DATASET_QUOTE_REFERENCE_REQUIRED',
        severity: 'error' as const,
        nodeId: aiNode.nodeId,
        inputKey: NodeInputKeyEnum.aiChatDatasetQuote,
        params: { upstreamDatasetNodeIds: [...upstreamDatasetNodeIds] }
      }
    ];
  });
};

const reachabilityIgnoredNodeTypes = new Set<FlowNodeTypeEnum>([
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

  // 这些缺项在 Web 中始终阻断，不依赖模型目录、权限或远端资源状态。
  if (
    node.flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
    !hasConfiguredValue(getInputValue(NodeInputKeyEnum.httpReqUrl))
  ) {
    diagnostics.push({
      code: 'WORKFLOW_REQUIRED_INPUT_MISSING',
      severity: 'error',
      nodeId: node.nodeId,
      inputKey: NodeInputKeyEnum.httpReqUrl
    });
  }
  const extractFields = getInputValue(NodeInputKeyEnum.extractKeys);
  if (
    node.flowNodeType === FlowNodeTypeEnum.contentExtract &&
    (!Array.isArray(extractFields) || extractFields.length === 0)
  ) {
    diagnostics.push({
      code: 'WORKFLOW_EXTRACT_FIELDS_REQUIRED',
      severity: 'error',
      nodeId: node.nodeId,
      inputKey: NodeInputKeyEnum.extractKeys
    });
  }
  if (
    node.flowNodeType === FlowNodeTypeEnum.datasetConcatNode &&
    !node.inputs.some((input) => input.canEdit)
  ) {
    diagnostics.push({
      code: 'WORKFLOW_REQUIRED_INPUT_MISSING',
      severity: 'error',
      nodeId: node.nodeId,
      inputKey: NodeInputKeyEnum.datasetQuoteList
    });
  }

  if (node.flowNodeType === FlowNodeTypeEnum.variableUpdate) {
    /** Web 校验引用是否仍存活；Core 文档同时兼容输出的稳定 key 和旧 id。 */
    const isLiveReference = (value: unknown) => {
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        typeof value[0] !== 'string' ||
        !value[0] ||
        typeof value[1] !== 'string' ||
        !value[1]
      )
        return false;
      const [nodeId, outputKey] = value;
      if (nodeId === VARIABLE_NODE_ID) return true;
      return (
        document.nodes
          .find((item) => item.nodeId === nodeId)
          ?.outputs.some((output) => output.key === outputKey || output.id === outputKey) ?? false
      );
    };

    /** 引用数组逐项校验；清空数组和固定布尔值无需预填 value。 */
    const isVariableUpdateValueMissing = (item: {
      value?: unknown;
      renderType?: unknown;
      arrayMode?: unknown;
      booleanMode?: unknown;
    }) => {
      if (item.renderType === FlowNodeInputTypeEnum.reference) {
        const references = getWorkflowReferenceValues(item.value);
        return !references?.length || references.some((reference) => !isLiveReference(reference));
      }
      if (item.arrayMode === 'clear' || item.booleanMode) return false;
      return (
        !Array.isArray(item.value) ||
        item.value[1] === undefined ||
        item.value[1] === null ||
        item.value[1] === ''
      );
    };

    const updateList = getInputValue(NodeInputKeyEnum.updateList);
    if (!Array.isArray(updateList) || updateList.length === 0) {
      diagnostics.push(
        {
          code: 'WORKFLOW_VARIABLE_UPDATE_TARGET_MISSING',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: NodeInputKeyEnum.updateList,
          params: { field: 'variable' }
        },
        {
          code: 'WORKFLOW_VARIABLE_UPDATE_VALUE_MISSING',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: NodeInputKeyEnum.updateList,
          params: { field: 'value' }
        }
      );
    } else {
      updateList.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          diagnostics.push({
            code: 'WORKFLOW_VARIABLE_UPDATE_ITEM_INVALID',
            severity: 'error',
            nodeId: node.nodeId,
            inputKey: NodeInputKeyEnum.updateList,
            params: { index }
          });
          return;
        }

        const update = item as {
          variable?: unknown;
          value?: unknown;
          renderType?: unknown;
          arrayMode?: unknown;
          booleanMode?: unknown;
        };
        if (!isLiveReference(update.variable)) {
          diagnostics.push({
            code: 'WORKFLOW_VARIABLE_UPDATE_TARGET_MISSING',
            severity: 'error',
            nodeId: node.nodeId,
            inputKey: NodeInputKeyEnum.updateList,
            params: { index, field: 'variable' }
          });
        }
        if (isVariableUpdateValueMissing(update)) {
          diagnostics.push({
            code: 'WORKFLOW_VARIABLE_UPDATE_VALUE_MISSING',
            severity: 'error',
            nodeId: node.nodeId,
            inputKey: NodeInputKeyEnum.updateList,
            params: { index, field: 'value' }
          });
        }
      });
    }
  }

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
        nodeId: node.nodeId,
        inputKey: NodeInputKeyEnum.ifElseList
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
    const reason = (() => {
      if (!Array.isArray(options) || options.length === 0) return 'empty';
      if (
        options.some(
          (item) =>
            !item ||
            typeof item !== 'object' ||
            typeof (item as { value?: unknown }).value !== 'string' ||
            !(item as { value: string }).value
        )
      )
        return 'value_empty';
      if (
        optionKeys.some((key) => typeof key !== 'string') ||
        new Set(optionKeys).size !== optionKeys.length
      )
        return 'invalid_keys';
    })();
    if (reason) {
      diagnostics.push({
        code: 'WORKFLOW_BRANCH_CONFIGURATION_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: key,
        params: { reason }
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
        nodeId: node.nodeId,
        inputKey: NodeInputKeyEnum.userInputForms,
        params: {
          reason: !Array.isArray(forms) || forms.length === 0 ? 'empty' : 'invalid_field',
          fieldKeys: formKeys.filter((key): key is string => typeof key === 'string')
        }
      });
    }
  }

  if (node.flowNodeType === FlowNodeTypeEnum.toolCall) {
    const hasTool = document.executionEdges.some(
      (edge) => edge.source.kind === 'selectedTools' && edge.source.nodeId === node.nodeId
    );
    const usesSandbox = Boolean(getInputValue(NodeInputKeyEnum.useAgentSandbox));
    if (!hasTool && !usesSandbox) {
      diagnostics.push({
        code: 'WORKFLOW_TOOL_REQUIRED',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }
};

/**
 * 共享静态校验：通用输入和连通性遵循 Web 规则，并保留 Core 的唯一性、类型、端口及容器约束。
 * CLI、辅助生成及运行/发布入口统一执行完整检查，包括主入口与嵌套入口的孤立检查。
 * 返回诊断供调用方决定阻断或展示；保存草稿不调用此检查。
 * 仅显式传入 modelCheck 时检查模型；CLI 生成不传，Web 注入目录和模板。资源状态由 Web/服务端补充。
 */
export const validateWorkflow = (
  document: WorkflowDocument,
  { modelCheck }: { modelCheck?: Omit<Parameters<typeof checkWorkflowModels>[0], 'document'> } = {}
): WorkflowDiagnostic[] => {
  const schemaResult = WorkflowDocumentSchema.safeParse(document);
  if (!schemaResult.success) {
    return schemaResult.error.issues.map((issue) => ({
      code: 'WORKFLOW_SCHEMA_INVALID',
      severity: 'error' as const,
      path: issue.path.map((item) => (typeof item === 'symbol' ? item.toString() : item)),
      params: { reason: issue.message }
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
    validateNodeIO({ document, node, diagnostics });
    validateSpecialNode({ document, node, diagnostics });
    validateContainer({ document, node, diagnostics });
  }

  const startNodes = document.nodes.filter(
    (node) =>
      node.flowNodeType === FlowNodeTypeEnum.workflowStart ||
      node.flowNodeType === FlowNodeTypeEnum.pluginInput
  );
  if (startNodes.length !== 1) {
    diagnostics.push({
      code: 'WORKFLOW_START_COUNT_INVALID',
      severity: 'error',
      params: { count: startNodes.length }
    });
  }

  const edgeKeys = new Set<string>();
  const validEdges: WorkflowDocument['executionEdges'] = [];
  for (const edge of document.executionEdges) {
    const edgeKey = JSON.stringify(edge);
    if (edgeKeys.has(edgeKey)) {
      diagnostics.push({ code: 'WORKFLOW_EDGE_DUPLICATED', severity: 'error', params: { edge } });
    }
    edgeKeys.add(edgeKey);
    try {
      assertExecutionEdge(document, edge);
      validEdges.push(edge);
    } catch (error) {
      if (error instanceof WorkflowCommandError) {
        diagnostics.push(
          ...error.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            params: { ...diagnostic.params, edge }
          }))
        );
      } else {
        diagnostics.push({
          code: 'WORKFLOW_EDGE_INVALID',
          severity: 'error',
          params: { edge, reason: error instanceof Error ? error.message : String(error) }
        });
      }
    }
  }

  const entryTypes = new Set([
    FlowNodeTypeEnum.workflowStart,
    FlowNodeTypeEnum.pluginInput,
    FlowNodeTypeEnum.nestedStart,
    FlowNodeTypeEnum.loopRunStart
  ]);
  const entryNodeIds = document.nodes
    .filter((node) => entryTypes.has(node.flowNodeType))
    .map((node) => node.nodeId);
  // 非法端口/作用域已单独报错，不能再让这些边把不可达节点伪装成已连通。
  const reachableNodeIds = getReachableNodeIds(
    { ...document, executionEdges: validEdges },
    entryNodeIds
  );
  // 普通孤立节点已由不可达检查阻断；入口天然可达，需要单独检查，避免重复诊断。
  const connectedNodeIds = new Set(
    validEdges.flatMap((edge) => [edge.source.nodeId, edge.target.nodeId])
  );
  const incomingNodeIds = new Set(validEdges.map((edge) => edge.target.nodeId));
  for (const node of document.nodes) {
    if (reachabilityIgnoredNodeTypes.has(node.flowNodeType)) continue;
    if (!entryTypes.has(node.flowNodeType) && !reachableNodeIds.has(node.nodeId)) {
      diagnostics.push({
        code: 'WORKFLOW_NODE_NOT_REACHABLE',
        severity: 'error',
        nodeId: node.nodeId,
        params: {
          reason: incomingNodeIds.has(node.nodeId) ? 'unreachable_from_start' : 'no_upstream'
        }
      });
    } else if (!connectedNodeIds.has(node.nodeId)) {
      diagnostics.push({
        code: 'WORKFLOW_NODE_ISOLATED',
        severity: 'error',
        nodeId: node.nodeId
      });
    }
  }

  return modelCheck
    ? [...diagnostics, ...checkWorkflowModels({ document, ...modelCheck })]
    : diagnostics;
};
