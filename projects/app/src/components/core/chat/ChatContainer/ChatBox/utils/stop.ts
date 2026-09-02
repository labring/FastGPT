type RequestStopAndAbortClientParams = {
  requestStop: () => Promise<unknown>;
  abortClientRequest: () => void;
};

/**
 * 先确认服务端已写入停止标记，再中断当前客户端请求。
 *
 * 服务端确认失败时不能 abort 客户端，否则 v2 工作流不会通过连接断开感知停止，
 * 可能出现界面已经结束但后台仍完整运行的状态。
 */
export const requestStopAndAbortClient = async ({
  requestStop,
  abortClientRequest
}: RequestStopAndAbortClientParams) => {
  await requestStop();
  abortClientRequest();
};
