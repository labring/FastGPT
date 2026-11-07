import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowCommandError } from '../domain/diagnostic';
import { getDocumentNode } from './service';

/** 查询容器的直接子节点，不修改父子关系。 */
export const listContainerChildren = (document: WorkflowDocument, parentNodeId: string) => {
  const parent = getDocumentNode(document, parentNodeId);
  if (!isNestedParentNodeType(parent.flowNodeType)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.parentNotContainer,
        severity: 'error',
        nodeId: parentNodeId
      }
    ]);
  }
  return document.nodes.filter((item) => item.parentNodeId === parentNodeId);
};
