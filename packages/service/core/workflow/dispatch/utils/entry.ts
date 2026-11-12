export type WorkflowNodeResponseWriteConfig = {
  /** 是否把本轮 nodeResponse rows 持久化到 chat_item_responses。 */
  persistToDb: boolean;
  /** 是否在请求内保留 flat nodeResponses，供接口最终返回 responseData。 */
  retainInMemory: boolean;
};
