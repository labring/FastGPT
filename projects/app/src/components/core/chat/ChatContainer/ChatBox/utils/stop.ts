export const STOP_STREAM_SETTLE_TIMEOUT_MS = 4000;

type RequestStopAndAbortClientParams = {
  requestStop: () => Promise<unknown>;
  abortClientRequest: () => void;
  /** 等待当前打开的 SSE 生成或恢复流在服务端落库并释放租约后自然收尾。 */
  waitForStreamSettle?: () => Promise<unknown>;
  settleTimeoutMs?: number;
};

/**
 * 先确认服务端已写入停止标记，优先等待当前 SSE 流完成落库与租约释放后自然收尾，再执行客户端兜底清理。
 *
 * 服务端确认失败时不能 abort 客户端，否则 v2 工作流不会通过连接断开感知停止，
 * 可能出现界面已经结束但后台仍完整运行的状态；若流在超时窗口内未收尾，则由客户端主动中断兜底恢复。
 */
export const requestStopAndAbortClient = async ({
  requestStop,
  abortClientRequest,
  waitForStreamSettle,
  settleTimeoutMs = STOP_STREAM_SETTLE_TIMEOUT_MS
}: RequestStopAndAbortClientParams) => {
  await requestStop();

  if (waitForStreamSettle) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve(waitForStreamSettle()).catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, settleTimeoutMs);
        })
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  abortClientRequest();
};
