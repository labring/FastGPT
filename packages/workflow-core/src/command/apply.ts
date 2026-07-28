import { getWorkflowChecksum } from '../domain/checksum';
import type { WorkflowDocument } from '../domain/document';
import type { WorkflowDiagnostic } from '../domain/diagnostic';
import {
  assertExecutionEdge,
  connectExecutionEdge,
  disconnectExecutionEdge,
  getDefaultExecutionSourcePort,
  reconnectExecutionEdge
} from '../edge/service';
import type { WorkflowExecutionEdge } from '../edge/type';
import { setInputReference, setInputValue, unsetInput } from '../reference/service';
import { cloneNode, removeNode, updateNode } from '../node/service';
import {
  addGlobalVariable,
  removeGlobalVariable,
  setChatConfigValue,
  unsetChatConfigValue,
  updateGlobalVariable
} from '../config/service';
import { WorkflowCommandError } from '../domain/diagnostic';
import type { WorkflowTemplateProvider } from '../template/type';
import { WorkflowCommandSchema, type WorkflowChangeSummary, type WorkflowCommand } from './type';
import { addNodeFromTemplate } from '../node/add';
import {
  addNodeInput,
  addNodeOutput,
  removeNodeInput,
  removeNodeOutput,
  syncCodeNodeIO,
  syncFormInputOutputs
} from '../io/service';
import { getDocumentNode, moveNodeToParent } from '../nesting/service';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export type WorkflowCommandResult = {
  document: WorkflowDocument;
  changes: WorkflowChangeSummary[];
  warnings: WorkflowDiagnostic[];
  checksum: string;
};

/**
 * 对结构化副本执行一条领域命令。任何步骤失败都会丢弃副本，调用方不会拿到半成品。
 */
export const applyWorkflowCommand = async ({
  document,
  command: rawCommand,
  dependencies
}: {
  document: WorkflowDocument;
  command: WorkflowCommand;
  dependencies: {
    templateProvider: WorkflowTemplateProvider;
    locale?: string;
    translate?: (value: string) => string;
  };
}): Promise<WorkflowCommandResult> => {
  const command = WorkflowCommandSchema.parse(rawCommand);
  const nextDocument = structuredClone(document);
  const warnings: WorkflowDiagnostic[] = [];
  const changes: WorkflowChangeSummary[] = [];

  if (command.type === 'node.add') {
    const added = await addNodeFromTemplate({
      document: nextDocument,
      template: command.template,
      nodeId: command.nodeId,
      name: command.name,
      position: command.position,
      parentNodeId: command.parentNodeId,
      dependencies
    });
    warnings.push(...added.warnings);

    for (const [inputKey, value] of Object.entries(command.inputOverrides ?? {})) {
      setInputValue({ document: nextDocument, nodeId: command.nodeId, inputKey, value });
    }

    if (command.connectFrom) {
      const edge: WorkflowExecutionEdge = {
        source: command.connectFrom,
        target: { kind: 'target', nodeId: command.nodeId }
      };
      connectExecutionEdge({ document: nextDocument, edge });
    }
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      ...(added.nodeIds.length > 1 ? { details: { nodeIds: added.nodeIds } } : {})
    });
  }

  if (command.type === 'input.set') {
    const inputNode = getDocumentNode(nextDocument, command.nodeId);
    let previousFormFieldKeys: string[] = [];
    if (
      inputNode.flowNodeType === FlowNodeTypeEnum.formInput &&
      command.inputKey === NodeInputKeyEnum.userInputForms
    ) {
      const previousForms =
        (inputNode.inputs.find((item) => item.key === command.inputKey)?.value as
          | Array<{ key?: unknown }>
          | undefined) ?? [];
      previousFormFieldKeys = previousForms
        .map((item) => item.key)
        .filter((key): key is string => typeof key === 'string');
    }
    setInputValue({
      document: nextDocument,
      nodeId: command.nodeId,
      inputKey: command.inputKey,
      value: command.value
    });
    syncFormInputOutputs({
      document: nextDocument,
      nodeId: command.nodeId,
      previousFieldKeys: previousFormFieldKeys
    });
    const codeIOSync =
      inputNode.flowNodeType === FlowNodeTypeEnum.code &&
      command.inputKey === NodeInputKeyEnum.code &&
      typeof command.value === 'string'
        ? syncCodeNodeIO({
            document: nextDocument,
            nodeId: command.nodeId,
            code: command.value
          })
        : undefined;
    codeIOSync?.removedOutputs.forEach((output) => {
      if (output.references.length === 0) return;
      warnings.push({
        code: 'WORKFLOW_OUTPUT_REFERENCES_REMAIN',
        severity: 'warning',
        nodeId: command.nodeId,
        params: { outputKey: output.outputKey, references: output.references }
      });
    });

    let removedBranchEdgeCount = 0;
    nextDocument.executionEdges = nextDocument.executionEdges.filter((edge) => {
      if (edge.source.kind !== 'branch' || edge.source.nodeId !== command.nodeId) return true;
      try {
        assertExecutionEdge(nextDocument, edge);
        return true;
      } catch {
        removedBranchEdgeCount += 1;
        return false;
      }
    });
    if (removedBranchEdgeCount > 0) {
      warnings.push({
        code: 'WORKFLOW_BRANCH_EDGES_REMOVED',
        severity: 'warning',
        nodeId: command.nodeId,
        params: { removedEdgeCount: removedBranchEdgeCount }
      });
    }
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      inputKey: command.inputKey,
      ...(removedBranchEdgeCount > 0 || codeIOSync
        ? {
            details: {
              ...(removedBranchEdgeCount > 0 ? { removedBranchEdgeCount } : {}),
              ...(codeIOSync ? { codeIOSync } : {})
            }
          }
        : {})
    });
  }

  if (command.type === 'input.ref') {
    setInputReference({
      document: nextDocument,
      nodeId: command.nodeId,
      inputKey: command.inputKey,
      ref: command.ref
    });
    changes.push({ type: command.type, nodeId: command.nodeId, inputKey: command.inputKey });
  }

  if (command.type === 'input.add') {
    addNodeInput({ document: nextDocument, nodeId: command.nodeId, input: command.input });
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      inputKey: command.input.key
    });
  }

  if (command.type === 'input.remove') {
    removeNodeInput({
      document: nextDocument,
      nodeId: command.nodeId,
      inputKey: command.inputKey
    });
    changes.push({ type: command.type, nodeId: command.nodeId, inputKey: command.inputKey });
  }

  if (command.type === 'node.update') {
    if (
      command.name === undefined &&
      command.position === undefined &&
      command.catchError === undefined
    ) {
      throw new WorkflowCommandError([
        { code: 'WORKFLOW_NODE_UPDATE_EMPTY', severity: 'error', nodeId: command.nodeId }
      ]);
    }
    updateNode({
      document: nextDocument,
      nodeId: command.nodeId,
      name: command.name,
      position: command.position,
      catchError: command.catchError
    });
    let removedCatchEdgeCount = 0;
    if (command.catchError === false) {
      const before = nextDocument.executionEdges.length;
      nextDocument.executionEdges = nextDocument.executionEdges.filter(
        (edge) => !(edge.source.kind === 'catch' && edge.source.nodeId === command.nodeId)
      );
      removedCatchEdgeCount = before - nextDocument.executionEdges.length;
    }
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      ...(removedCatchEdgeCount > 0 ? { details: { removedCatchEdgeCount } } : {})
    });
  }

  if (command.type === 'node.move') {
    let details: Record<string, unknown> = {};
    if (command.parentNodeId !== undefined) {
      details = moveNodeToParent({
        document: nextDocument,
        nodeId: command.nodeId,
        parentNodeId: command.parentNodeId ?? undefined,
        position: command.position
      });
    } else {
      updateNode({
        document: nextDocument,
        nodeId: command.nodeId,
        position: command.position
      });
    }
    changes.push({ type: command.type, nodeId: command.nodeId, details });
  }

  if (command.type === 'node.insert') {
    if (command.from.kind === 'selectedTools') {
      throw new WorkflowCommandError([
        { code: 'WORKFLOW_INSERT_TOOL_EDGE_UNSUPPORTED', severity: 'error' }
      ]);
    }
    const oldEdge: WorkflowExecutionEdge = { source: command.from, target: command.to };
    disconnectExecutionEdge({ document: nextDocument, edge: oldEdge });
    const targetNode = getDocumentNode(nextDocument, command.to.nodeId);
    const added = await addNodeFromTemplate({
      document: nextDocument,
      template: command.template,
      nodeId: command.nodeId,
      position: command.position,
      parentNodeId: targetNode.parentNodeId,
      dependencies
    });
    warnings.push(...added.warnings);
    connectExecutionEdge({
      document: nextDocument,
      edge: { source: command.from, target: { kind: 'target', nodeId: command.nodeId } }
    });
    connectExecutionEdge({
      document: nextDocument,
      edge: {
        source: getDefaultExecutionSourcePort(nextDocument, command.nodeId),
        target: command.to
      }
    });
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      details: { replacedEdge: oldEdge, nodeIds: added.nodeIds }
    });
  }

  if (command.type === 'node.clone') {
    cloneNode({
      document: nextDocument,
      sourceNodeId: command.sourceNodeId,
      nodeId: command.nodeId,
      position: command.position,
      offset: command.offset
    });
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      details: { sourceNodeId: command.sourceNodeId }
    });
  }

  if (command.type === 'node.remove') {
    const details = removeNode({ document: nextDocument, nodeId: command.nodeId });
    changes.push({ type: command.type, nodeId: command.nodeId, details });
  }

  if (command.type === 'edge.connect') {
    connectExecutionEdge({ document: nextDocument, edge: command.edge });
    changes.push({ type: command.type, details: { edge: command.edge } });
  }

  if (command.type === 'edge.disconnect') {
    disconnectExecutionEdge({ document: nextDocument, edge: command.edge });
    changes.push({ type: command.type, details: { edge: command.edge } });
  }

  if (command.type === 'edge.reconnect') {
    reconnectExecutionEdge({
      document: nextDocument,
      oldEdge: command.oldEdge,
      newEdge: command.newEdge
    });
    changes.push({
      type: command.type,
      details: { oldEdge: command.oldEdge, newEdge: command.newEdge }
    });
  }

  if (command.type === 'input.unset') {
    unsetInput({ document: nextDocument, nodeId: command.nodeId, inputKey: command.inputKey });
    changes.push({ type: command.type, nodeId: command.nodeId, inputKey: command.inputKey });
  }

  if (command.type === 'output.add') {
    addNodeOutput({ document: nextDocument, nodeId: command.nodeId, output: command.output });
    changes.push({ type: command.type, nodeId: command.nodeId, key: command.output.key });
  }

  if (command.type === 'output.remove') {
    const details = removeNodeOutput({
      document: nextDocument,
      nodeId: command.nodeId,
      outputKey: command.outputKey
    });
    changes.push({
      type: command.type,
      nodeId: command.nodeId,
      key: command.outputKey,
      details
    });
    if (details.references.length > 0) {
      warnings.push({
        code: 'WORKFLOW_OUTPUT_REFERENCES_REMAIN',
        severity: 'warning',
        nodeId: command.nodeId,
        params: { outputKey: command.outputKey, references: details.references }
      });
    }
  }

  if (command.type === 'tool.attach') {
    const toolCallNode = getDocumentNode(nextDocument, command.toolCallNodeId);
    let toolNodeId = command.toolNodeId;
    if (command.template && command.newNodeId) {
      const added = await addNodeFromTemplate({
        document: nextDocument,
        template: command.template,
        nodeId: command.newNodeId,
        position: command.position,
        parentNodeId: toolCallNode.parentNodeId,
        dependencies
      });
      warnings.push(...added.warnings);
      toolNodeId = command.newNodeId;
    }
    connectExecutionEdge({
      document: nextDocument,
      edge: {
        source: { kind: 'selectedTools', nodeId: command.toolCallNodeId },
        target: { kind: 'selectedTools', nodeId: toolNodeId! }
      }
    });
    changes.push({
      type: command.type,
      nodeId: command.toolCallNodeId,
      details: { toolNodeId }
    });
  }

  if (command.type === 'tool.detach') {
    disconnectExecutionEdge({
      document: nextDocument,
      edge: {
        source: { kind: 'selectedTools', nodeId: command.toolCallNodeId },
        target: { kind: 'selectedTools', nodeId: command.toolNodeId }
      }
    });
    changes.push({
      type: command.type,
      nodeId: command.toolCallNodeId,
      details: { toolNodeId: command.toolNodeId }
    });
  }

  if (command.type === 'meta.update') {
    if (command.name === undefined && command.intro === undefined) {
      throw new WorkflowCommandError([{ code: 'WORKFLOW_META_UPDATE_EMPTY', severity: 'error' }]);
    }
    if (command.name !== undefined) nextDocument.app.name = command.name;
    if (command.intro !== undefined) nextDocument.app.intro = command.intro;
    changes.push({ type: command.type });
  }

  if (command.type === 'config.set') {
    setChatConfigValue({ document: nextDocument, path: command.path, value: command.value });
    changes.push({ type: command.type, path: command.path });
  }

  if (command.type === 'config.unset') {
    unsetChatConfigValue({ document: nextDocument, path: command.path });
    changes.push({ type: command.type, path: command.path });
  }

  if (command.type === 'variable.add') {
    addGlobalVariable({ document: nextDocument, variable: command.variable });
    changes.push({ type: command.type, key: command.variable.key });
  }

  if (command.type === 'variable.update') {
    if (Object.keys(command.patch).length === 0) {
      throw new WorkflowCommandError([
        { code: 'WORKFLOW_VARIABLE_UPDATE_EMPTY', severity: 'error', params: { key: command.key } }
      ]);
    }
    updateGlobalVariable({ document: nextDocument, key: command.key, patch: command.patch });
    changes.push({ type: command.type, key: command.key });
  }

  if (command.type === 'variable.remove') {
    removeGlobalVariable({ document: nextDocument, key: command.key });
    changes.push({ type: command.type, key: command.key });
  }

  return {
    document: nextDocument,
    changes,
    warnings,
    checksum: await getWorkflowChecksum(nextDocument)
  };
};
