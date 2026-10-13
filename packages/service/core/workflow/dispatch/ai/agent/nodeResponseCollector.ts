import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { WorkflowNodeResponseSinkLike } from '../../nodeResponseSink';
import type { WorkflowRuntimeSummaryType } from '../../type';
import { createWorkflowRuntimeSummary, summarizeRuntimeNodeResponses } from '../../utils/summary';

/**
 * 收集 Agent 内部持续产生的 nodeResponse。
 *
 * 普通 Agent 和 PiAgent 都会在一次节点运行中产生多条内部详情。业务链路存在请求级 sink
 * 时，这些详情应逐条发布并释放，同时通过回调贡献当前 Agent 的 nodeSummary；无 sink
 * 只保留给不落库的调试/单测路径，继续返回旧的内存数组。
 */
export const createAgentNodeResponseCollector = ({
  nodeResponseSink,
  nodeResponses,
  onNodeResponseSummary
}: {
  nodeResponseSink?: WorkflowNodeResponseSinkLike;
  nodeResponses: ChatHistoryItemResType[];
  onNodeResponseSummary?: (summary: WorkflowRuntimeSummaryType) => void;
}) => {
  let workflowRuntimeSummary: WorkflowRuntimeSummaryType = createWorkflowRuntimeSummary();
  let writeQueue = Promise.resolve();

  const appendNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
    if (!nodeResponseSink) {
      nodeResponses.push(nodeResponse);
    }

    const responseSummary = summarizeRuntimeNodeResponses(undefined, [nodeResponse]);
    workflowRuntimeSummary = summarizeRuntimeNodeResponses(workflowRuntimeSummary, [nodeResponse]);
    // 有 workflow sink 时，scope.publish 已经把 response summary 写入当前层总账；
    // 只有无 sink 的调试/单测路径才需要通过 callback 传递这份增量。
    if (!nodeResponseSink) {
      onNodeResponseSummary?.(responseSummary);
    }
    if (!nodeResponseSink) return;
    // Agent runtime 可能连续同步 append 多条详情，这里串行交给共享 sink，避免乱序。
    writeQueue = writeQueue
      .then(() => nodeResponseSink.publish([{ response: nodeResponse }]))
      .then(
        () => undefined,
        () => undefined
      );
  };

  return {
    appendNodeResponse,
    flush: () => writeQueue,
    getNodeResponses: () => (nodeResponseSink ? undefined : nodeResponses),
    getWorkflowRuntimeSummary: () => (nodeResponseSink ? workflowRuntimeSummary : undefined)
  };
};
