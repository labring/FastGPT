import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { WorkflowExecutionEdge } from '@fastgpt/global/core/workflow/type/edge';
import { WorkflowCommandError } from '../domain/diagnostic';
import { assertExecutionConnection, executionEdgesEqual } from './validation';

export const connectExecutionEdge = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  assertExecutionConnection({ document, edge });
  document.executionEdges.push(edge);
};

/** 找到已有连线的位置；找不到时不修改工作流。 */
const getExecutionEdgeIndex = (document: WorkflowDocument, edge: WorkflowExecutionEdge) => {
  const index = document.executionEdges.findIndex((item) => executionEdgesEqual(item, edge));
  if (index < 0) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.edgeNotFound, severity: 'error', params: { edge } }
    ]);
  }
  return index;
};

export const disconnectExecutionEdge = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  document.executionEdges.splice(getExecutionEdgeIndex(document, edge), 1);
};

/** 在移除旧边后的拓扑上校验新边；校验成功后才写回。 */
export const reconnectExecutionEdge = ({
  document,
  oldEdge,
  newEdge
}: {
  document: WorkflowDocument;
  oldEdge: WorkflowExecutionEdge;
  newEdge: WorkflowExecutionEdge;
}) => {
  const oldIndex = getExecutionEdgeIndex(document, oldEdge);
  const remainingEdges = document.executionEdges.filter((_, index) => index !== oldIndex);
  assertExecutionConnection({
    document: { ...document, executionEdges: remainingEdges },
    edge: newEdge
  });
  document.executionEdges = [...remainingEdges, newEdge];
};
