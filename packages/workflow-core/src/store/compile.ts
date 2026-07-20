import { WorkflowTemplateBasicTypeSchema } from '@fastgpt/global/core/workflow/type';
import type { WorkflowDocument } from '../domain/document';
import { compileExecutionEdge } from '../edge/compiler';
import { encodeWorkflowNodeReferences } from '../reference/codec';

/** 将唯一规范状态编译为 FastGPT Web/Service 可读取的 StoreWorkflow。 */
export const compileStoreWorkflow = (document: WorkflowDocument) =>
  WorkflowTemplateBasicTypeSchema.parse({
    nodes: encodeWorkflowNodeReferences(document.nodes),
    edges: document.executionEdges.map((edge) => compileExecutionEdge(edge, document)),
    chatConfig: structuredClone(document.chatConfig)
  });
