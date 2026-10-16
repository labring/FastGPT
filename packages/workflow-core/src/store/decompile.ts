import {
  WorkflowTemplateBasicTypeSchema,
  type WorkflowTemplateBasicType
} from '@fastgpt/global/core/workflow/type';
import { createWorkflowDocument } from '../domain/document';
import { type WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { decompileStoreEdge } from '../edge/compiler';
import { decodeWorkflowNodeReferences } from '../reference/codec';

/** 将 StoreWorkflow 转成语义 Document，并保留显式提供的应用绑定信息。 */
export const decompileStoreWorkflow = ({
  workflow,
  app = {}
}: {
  workflow: WorkflowTemplateBasicType;
  app?: WorkflowDocument['app'];
}): WorkflowDocument => {
  const parsedWorkflow = WorkflowTemplateBasicTypeSchema.parse(workflow);
  const documentWithoutEdges = createWorkflowDocument({
    app,
    nodes: decodeWorkflowNodeReferences(parsedWorkflow.nodes),
    chatConfig: parsedWorkflow.chatConfig ?? {}
  });

  return {
    ...documentWithoutEdges,
    executionEdges: parsedWorkflow.edges.map((edge) =>
      decompileStoreEdge(edge, documentWithoutEdges)
    )
  };
};
