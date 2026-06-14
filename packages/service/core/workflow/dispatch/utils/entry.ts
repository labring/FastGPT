import type { WorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';
import { createWorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';

export type WorkflowNodeResponseWriteConfig = {
  /** 是否把本轮 nodeResponse rows 持久化到 chat_item_responses。 */
  persistToDb: boolean;
  /** 是否在请求内保留 flat nodeResponses，供接口最终返回 responseData。 */
  retainInMemory: boolean;
};

/**
 * 创建 workflow 入口级 nodeResponse writer。
 *
 * 写 DB 和保留内存的策略由业务入口显式传入，dispatch 层不再根据 mode/chatId/detail
 * 推断。子 workflow 只复用这个 writer，不关心当前请求到底落库还是仅保留请求内 flat 数据。
 */
export const createWorkflowEntryNodeResponseWriter = async ({
  teamId,
  appId,
  chatId,
  chatItemDataId,
  nodeResponseWriteConfig
}: {
  teamId: string;
  appId: string;
  chatId: string;
  chatItemDataId: string;
  nodeResponseWriteConfig: WorkflowNodeResponseWriteConfig;
}): Promise<{
  nodeResponseWriter: WorkflowNodeResponseWriter;
}> => {
  return {
    nodeResponseWriter: await createWorkflowNodeResponseWriter({
      teamId,
      appId,
      chatId,
      chatItemDataId,
      persistToDb: nodeResponseWriteConfig.persistToDb,
      retainInMemory: nodeResponseWriteConfig.retainInMemory
    })
  };
};
