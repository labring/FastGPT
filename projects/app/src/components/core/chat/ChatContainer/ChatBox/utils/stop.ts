export const STOP_STREAM_SETTLE_TIMEOUT_MS = 4000;

type StopTargetSnapshot = {
  controllers: Array<AbortController | undefined>;
  streamPromises: Array<Promise<void> | undefined>;
};

type RequestStopAndAbortClientParams = {
  requestStop: () => Promise<unknown>;
  abortClientRequest: () => void;
  /** 等待当前打开的 SSE 生成或恢复流在服务端落库并释放租约后自然收尾。 */
  waitForStreamSettle?: () => Promise<unknown>;
  settleTimeoutMs?: number;
};

/**
 * 按点击停止瞬间捕获的 controller 与流 Promise 创建隔离收尾器。
 *
 * 切换会话后共享 ref 会被新会话的生成/恢复流覆盖；这里固定本次点击所属的流与 controller，
 * 避免旧会话等待结束或超时后读取最新 ref，误杀切入会话的在途请求。
 */
export const createCapturedStopHandlers = ({
  controllers,
  streamPromises,
  abortController
}: StopTargetSnapshot & {
  abortController: (controller: AbortController | undefined, reason: Error) => void;
}) => {
  const capturedControllers = controllers.filter(Boolean);
  const capturedPromises = streamPromises.filter((promise): promise is Promise<void> =>
    Boolean(promise)
  );

  return {
    waitForStreamSettle: () => Promise.all(capturedPromises),
    abortClientRequest: () => {
      const reason = new Error('stop');
      capturedControllers.forEach((controller) => {
        abortController(controller, reason);
      });
    }
  };
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
