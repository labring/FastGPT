import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { getErrText } from '@fastgpt/global/common/error/utils';

/** 节点响应里是否带有需关注的错误（开启 catch 的节点仅作记录，不参与子图成败） */
export const flowResponseHasError = (res: ChatHistoryItemResType) => {
  if (res.errorText) return true;
  if (res.error == null || res.error === '') return false;
  if (typeof res.error === 'string') return true;
  if (typeof res.error === 'object' && Object.keys(res.error).length > 0) return true;
  return Boolean(res.error);
};

const formatFlowResponseError = (res: ChatHistoryItemResType) => {
  if (res.errorText) return res.errorText;
  if (typeof res.error === 'string') return res.error;
  if (res.error && typeof res.error === 'object') return getErrText(res.error);
  return res.moduleName || res.nodeId;
};

/** 子画布内未开启「错误时继续」的节点若带 error，则本子工作流视为失败（与批处理一致） */
export const collectChildWorkflowUncaughtErrors = (
  flowResponses: ChatHistoryItemResType[],
  childrenNodeIdList: string[],
  catchErrorByNodeId: Map<string, boolean | undefined>
) => {
  const messages: string[] = [];
  for (const res of flowResponses) {
    if (!childrenNodeIdList.includes(res.nodeId)) continue;
    if (catchErrorByNodeId.get(res.nodeId)) continue;
    if (!flowResponseHasError(res)) continue;
    messages.push(`${res.moduleName}: ${formatFlowResponseError(res)}`);
  }
  return messages;
};

export const buildCatchErrorMapForChildren = (
  runtimeNodes: RuntimeNodeItemType[],
  childrenNodeIdList: string[]
) => {
  const catchErrorByNodeId = new Map<string, boolean | undefined>();
  runtimeNodes.forEach((n) => {
    if (childrenNodeIdList.includes(n.nodeId)) {
      catchErrorByNodeId.set(n.nodeId, n.catchError);
    }
  });
  return catchErrorByNodeId;
};
