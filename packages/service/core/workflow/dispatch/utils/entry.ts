import { createWorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import { WorkflowNodeResponseSink } from '../nodeResponseSink';

export type WorkflowNodeResponseWriteConfig = {
  /** 是否把本轮 nodeResponse rows 持久化到 chat_item_responses。 */
  persistToDb: boolean;
  /** 是否在请求内保留 flat nodeResponses，供接口最终返回 responseData。 */
  retainInMemory: boolean;
};

/**
 * 创建 workflow 入口级 nodeResponse sink。
 *
 * 写 DB 和保留内存的策略由业务入口显式传入，dispatch 层不再根据 mode/chatId/detail
 * 推断。子 workflow 只复用这个 sink，不关心当前请求到底落库还是仅保留请求内 flat 数据。
 */
export const createWorkflowEntryNodeResponseSink = async ({
  teamId,
  sourceType,
  sourceId,
  chatId,
  chatItemDataId,
  nodeResponseWriteConfig,
  apiVersion,
  responseAllData,
  responseDetail,
  workflowStreamResponse
}: {
  teamId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
  chatItemDataId: string;
  nodeResponseWriteConfig: WorkflowNodeResponseWriteConfig;
  apiVersion?: 'v1' | 'v2';
  responseAllData?: boolean;
  responseDetail?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
}): Promise<WorkflowNodeResponseSink> => {
  const writer = await createWorkflowNodeResponseWriter({
    teamId,
    sourceType,
    sourceId,
    chatId,
    chatItemDataId,
    persistToDb: nodeResponseWriteConfig.persistToDb,
    retainInMemory: nodeResponseWriteConfig.retainInMemory
  });

  return new WorkflowNodeResponseSink({
    writer,
    apiVersion,
    responseAllData,
    responseDetail,
    workflowStreamResponse
  });
};
