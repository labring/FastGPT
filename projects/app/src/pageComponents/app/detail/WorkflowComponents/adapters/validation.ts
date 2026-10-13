import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/workflowCheck';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  validateWorkflow,
  WorkflowCommandError,
  type WorkflowDiagnostic
} from '@fastgpt/workflow-core';
import type { Edge, Node } from 'reactflow';
import { reactFlowStateToWorkflowDocument } from './document';

const sharedWorkflowNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.textEditor,
  FlowNodeTypeEnum.answerNode,
  FlowNodeTypeEnum.datasetSearchNode,
  FlowNodeTypeEnum.queryExtension,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.httpRequest468,
  FlowNodeTypeEnum.code,
  FlowNodeTypeEnum.runApp,
  FlowNodeTypeEnum.ifElseNode,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.userSelect,
  FlowNodeTypeEnum.formInput,
  FlowNodeTypeEnum.toolCall,
  FlowNodeTypeEnum.readFiles,
  FlowNodeTypeEnum.variableUpdate,
  FlowNodeTypeEnum.parallelRun,
  FlowNodeTypeEnum.loopRun,
  FlowNodeTypeEnum.loopRunStart,
  FlowNodeTypeEnum.loopRunBreak,
  FlowNodeTypeEnum.loop,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.nestedEnd,
  FlowNodeTypeEnum.tool,
  FlowNodeTypeEnum.toolSet,
  FlowNodeTypeEnum.toolParams,
  FlowNodeTypeEnum.pluginModule,
  FlowNodeTypeEnum.appModule
]);

const validateWorkflowWithWebRules = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}) => {
  const { errorNodeIds } = checkWorkflowBeforeRunOrPublish({ nodes, edges });
  return errorNodeIds.length > 0 ? errorNodeIds : undefined;
};

const diagnosticsToNodeIds = ({
  diagnostics,
  nodes
}: {
  diagnostics: WorkflowDiagnostic[];
  nodes: Node<FlowNodeItemType, string | undefined>[];
}) => {
  const nodeIds = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== 'error') continue;
    if (diagnostic.nodeId) nodeIds.add(diagnostic.nodeId);
    const edge = diagnostic.params?.edge as
      | { source?: { nodeId?: string }; target?: { nodeId?: string } }
      | undefined;
    if (edge?.source?.nodeId) nodeIds.add(edge.source.nodeId);
    if (edge?.target?.nodeId) nodeIds.add(edge.target.nodeId);
  }
  if (diagnostics.some((item) => item.severity === 'error') && nodeIds.size === 0) {
    nodes.forEach((node) => nodeIds.add(node.data.nodeId));
  }
  return [...nodeIds];
};

/**
 * Web 校验适配器。已支持节点使用共享 Core Validator，未知节点和适配异常回退旧实现。
 */
export const validateWorkflowForWeb = ({
  nodes,
  edges,
  chatConfig = {}
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  chatConfig?: AppChatConfigType;
}): {
  nodeIds?: string[];
  diagnostics?: WorkflowDiagnostic[];
  source: 'shared' | 'legacy';
  adapterError?: unknown;
} => {
  if (nodes.some((node) => !sharedWorkflowNodeTypes.has(node.data.flowNodeType))) {
    return { nodeIds: validateWorkflowWithWebRules({ nodes, edges }), source: 'legacy' };
  }

  try {
    const document = reactFlowStateToWorkflowDocument({ nodes, edges, chatConfig });
    const diagnostics = validateWorkflow(document);
    const nodeIds = diagnosticsToNodeIds({ diagnostics, nodes });
    return {
      nodeIds: nodeIds.length > 0 ? nodeIds : undefined,
      diagnostics,
      source: 'shared'
    };
  } catch (error) {
    if (error instanceof WorkflowCommandError) {
      return {
        nodeIds: diagnosticsToNodeIds({ diagnostics: error.diagnostics, nodes }),
        diagnostics: error.diagnostics,
        source: 'shared'
      };
    }

    console.error('[Workflow Core Adapter] Failed to create WorkflowDocument', error);
    return {
      nodeIds: validateWorkflowWithWebRules({ nodes, edges }),
      source: 'legacy',
      adapterError: error
    };
  }
};

export const checkWorkflowNodeAndConnection = (
  input: Parameters<typeof validateWorkflowForWeb>[0]
) => validateWorkflowForWeb(input).nodeIds;
