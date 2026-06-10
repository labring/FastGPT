import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { WorkflowNodeResponseWriter } from '../../../../chat/nodeResponseStorage';
import type { RuntimeNodeResponseSummary } from '../../type';
import { createRuntimeNodeResponseSummary, summarizeRuntimeNodeResponses } from '../../utils';

/**
 * 收集 Agent 内部持续产生的 nodeResponse。
 *
 * 普通 Agent 和 PiAgent 都会在一次节点运行中产生多条内部详情。业务链路存在 root writer
 * 时，这些详情应立即写库并释放，只向父 workflow 返回运行期 summary；无 writer 只保留给
 * 不落库的调试/单测路径，继续返回旧的内存数组。
 */
export const createAgentNodeResponseCollector = ({
  nodeResponseWriter,
  nodeResponseParentId,
  nodeResponses
}: {
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  nodeResponseParentId?: string;
  nodeResponses: ChatHistoryItemResType[];
}) => {
  let runtimeNodeResponseSummary: RuntimeNodeResponseSummary = createRuntimeNodeResponseSummary();
  let writeQueue = Promise.resolve();

  const appendNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
    if (!nodeResponseWriter) {
      nodeResponses.push(nodeResponse);
      return;
    }

    runtimeNodeResponseSummary = summarizeRuntimeNodeResponses(runtimeNodeResponseSummary, [
      nodeResponse
    ]);
    // Agent runtime 可能连续同步 append 多条详情，这里串行交给共享 writer，避免乱序。
    writeQueue = writeQueue
      .then(() => nodeResponseWriter.recordWithParent([nodeResponse], nodeResponseParentId))
      .then(
        () => undefined,
        () => undefined
      );
  };

  return {
    appendNodeResponse,
    flush: () => writeQueue,
    getNodeResponses: () => (nodeResponseWriter ? undefined : nodeResponses),
    getRuntimeNodeResponseSummary: () =>
      nodeResponseWriter ? runtimeNodeResponseSummary : undefined
  };
};
