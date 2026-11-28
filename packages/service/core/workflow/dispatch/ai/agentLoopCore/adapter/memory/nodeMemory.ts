import { getWorkflowNodeMemoryKey, type WorkflowMemoryContext } from '../../../../context/memory';
import type { WorkflowMemorySource } from '../../../../../memory/utils';

/**
 * 完成态 memory：清理节点暂停快照。
 * 新一轮的 active plan 从 ChatItem history 恢复，不在 memory 中建立第二份状态。
 */
export const buildAgentLoopCoreDoneMemories = ({
  memoryContext,
  runningAppInfo,
  nodeId
}: {
  memoryContext?: WorkflowMemoryContext;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
}) => ({
  [getWorkflowNodeMemoryKey({ memoryContext, runningAppInfo, nodeId })]: undefined
});
