import type { NextApiResponse } from 'next';
import type { IncomingMessage } from 'node:http';

const getErrorCode = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return '';
  }

  return String((error as { code?: unknown }).code);
};

const isClientResetSocketError = (error: unknown) => {
  const code = getErrorCode(error);
  return code === 'ECONNRESET' || code === 'EPIPE';
};

export const createClientAbortTracker = ({
  req,
  res
}: {
  req?: IncomingMessage;
  res?: NextApiResponse;
}) => {
  let clientAborted = false;
  let requestAborted = !!req?.aborted;
  let responseCompleted = !!(res?.writableEnded || res?.writableFinished);
  let responseError = !!res?.errored;
  let serverSocketError = false;

  /**
   * v1 工作流只在客户端主动断开当前响应时停止。
   *
   * `socket.destroyed`、`res.destroyed`、`writableAborted` 这类快照过宽，不能单独证明用户取消。
   * `req.aborted` 是首选信号；但 Next API 运行时下 fetch abort 可能只稳定落到未 finish 的
   * `res.close`，因此把 close 作为 fallback。服务端 response/socket error 会屏蔽该 fallback，
   * 但客户端 reset 类 socket error 仍属于断开信号，不能抢先屏蔽后续 `req.aborted`/`res.close`。
   */
  const responseFinished = () =>
    responseCompleted || !!(res?.writableEnded || res?.writableFinished);
  const responseErrored = () => responseError || serverSocketError || !!res?.errored;
  const canAcceptRequestAbort = () => !responseFinished() && !responseErrored();
  const isRequestAbortedSnapshot = () =>
    (requestAborted || !!req?.aborted) && canAcceptRequestAbort();
  const markResponseCompleted = () => {
    responseCompleted = true;
  };
  const markResponseError = () => {
    responseError = true;
  };
  const markSocketError = (error: unknown) => {
    if (!isClientResetSocketError(error)) {
      serverSocketError = true;
    }
  };
  const markClientAborted = () => {
    requestAborted = true;
    if (canAcceptRequestAbort()) {
      clientAborted = true;
    }
  };
  const markResponseClosed = () => {
    if (canAcceptRequestAbort()) {
      clientAborted = true;
    }
  };

  req?.on('aborted', markClientAborted);
  req?.socket?.on('error', markSocketError);
  res?.on('finish', markResponseCompleted);
  res?.on('error', markResponseError);
  res?.on('close', markResponseClosed);

  return {
    isClientAborted: () => canAcceptRequestAbort() && (clientAborted || isRequestAbortedSnapshot()),
    cleanup: () => {
      req?.off('aborted', markClientAborted);
      req?.socket?.off('error', markSocketError);
      res?.off('finish', markResponseCompleted);
      res?.off('error', markResponseError);
      res?.off('close', markResponseClosed);
    }
  };
};
