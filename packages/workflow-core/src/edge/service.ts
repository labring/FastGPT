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

export const disconnectExecutionEdge = ({
  document,
  edge
}: {
  document: WorkflowDocument;
  edge: WorkflowExecutionEdge;
}) => {
  const index = document.executionEdges.findIndex((item) => executionEdgesEqual(item, edge));
  if (index < 0) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.edgeNotFound, severity: 'error', params: { edge } }
    ]);
  }
  document.executionEdges.splice(index, 1);
};

/** 先校验新边，再移除旧边，保证重连不会留下半成品。 */
export const reconnectExecutionEdge = ({
  document,
  oldEdge,
  newEdge
}: {
  document: WorkflowDocument;
  oldEdge: WorkflowExecutionEdge;
  newEdge: WorkflowExecutionEdge;
}) => {
  assertExecutionConnection({ document, edge: newEdge });
  disconnectExecutionEdge({ document, edge: oldEdge });
  document.executionEdges.push(newEdge);
};
