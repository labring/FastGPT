export type WorkflowEditorKind = 'code' | 'json';

type WorkflowEditorPathParams = {
  appId: string;
  sessionId: string;
};

type WorkflowEditorFieldPathParams = WorkflowEditorPathParams & {
  editorKind: WorkflowEditorKind;
  nodeId: string;
  fieldKey: string;
};

/** 返回当前工作流编辑页专属的 Monaco URI 前缀。 */
export const getWorkflowEditorPathPrefix = ({
  appId,
  sessionId
}: WorkflowEditorPathParams): string => {
  if (!appId || !sessionId) return '';
  return `inmemory://fastgpt/workflow/${encodeURIComponent(appId)}/${encodeURIComponent(sessionId)}/`;
};

/** 为工作流字段生成页面生命周期内稳定、跨页签隔离的 Monaco model URI。 */
export const getWorkflowEditorPath = ({
  appId,
  sessionId,
  editorKind,
  nodeId,
  fieldKey
}: WorkflowEditorFieldPathParams): string | undefined => {
  const prefix = getWorkflowEditorPathPrefix({ appId, sessionId });
  if (!prefix) return undefined;

  return `${prefix}${editorKind}/${encodeURIComponent(nodeId)}/${encodeURIComponent(fieldKey)}`;
};
