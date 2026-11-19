import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { WorkflowNodeResponseContext } from '../../context/nodeResponse';
import type { WorkflowRuntimeSummaryType } from '../../type';
import { createWorkflowRuntimeSummary, summarizeRuntimeNodeResponses } from '../../utils/summary';

/**
 * 收集 Agent 内部持续产生的 nodeResponse。
 *
 * 普通 Agent 和 PiAgent 都会在一次节点运行中产生多条内部详情。运行 Context 总会提供响应
 * Scope，详情逐条串行发布并释放；scope.publish 已写入当前层总账，这里只维护本 Agent 的摘要。
 */
export const createAgentNodeResponseCollector = ({
  nodeResponseSink,
  nodeResponseParentId
}: {
  nodeResponseSink: WorkflowNodeResponseContext;
  nodeResponseParentId?: string;
}) => {
  let workflowRuntimeSummary: WorkflowRuntimeSummaryType = createWorkflowRuntimeSummary();
  let writeQueue = Promise.resolve();

  const appendNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
    workflowRuntimeSummary = summarizeRuntimeNodeResponses(workflowRuntimeSummary, [nodeResponse]);
    // 工作流 Agent 节点会将内部产生的主模型、工具、规划、追问和压缩步骤挂载到当前 Agent 根响应下；
    // 已自带 parentId 的步骤（如挂在具体工具下的 toolResponseCompress）保留自身层级。
    const parentId = nodeResponse.parentId ?? nodeResponseParentId;
    // Agent runtime 可能连续同步 append 多条详情，这里串行交给共享 sink，避免乱序。
    writeQueue = writeQueue
      .then(() =>
        nodeResponseSink.publish([
          {
            response: nodeResponse,
            ...(parentId !== undefined ? { parentId } : {})
          }
        ])
      )
      .then(
        () => undefined,
        () => undefined
      );
  };

  return {
    appendNodeResponse,
    flush: () => writeQueue,
    getWorkflowRuntimeSummary: () => workflowRuntimeSummary
  };
};
