import type { NextApiResponse } from 'next';
import type { IncomingMessage } from 'node:http';

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
  let socketError = false;

  /**
   * v1 工作流只在客户端主动断开当前响应时停止。
   *
   * `socket.destroyed`、`res.destroyed`、`writableAborted` 这类快照过宽，不能单独证明用户取消。
   * `req.aborted` 是首选信号；但 Next API 运行时下 fetch abort 可能只稳定落到
   * 未 finish 的 `res.close`，因此把 close 作为 fallback，同时排除服务端 response/socket error。
   */
  const responseFinished = () =>
    responseCompleted || !!(res?.writableEnded || res?.writableFinished);
  const responseErrored = () => responseError || socketError || !!res?.errored;
  const canAcceptRequestAbort = () => !responseFinished() && !responseErrored();
  const isRequestAbortedSnapshot = () =>
    (requestAborted || !!req?.aborted) && canAcceptRequestAbort();
  const markResponseCompleted = () => {
    responseCompleted = true;
  };
  const markResponseError = () => {
    responseError = true;
  };
  const markSocketError = () => {
    socketError = true;
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
    isClientAborted: () => clientAborted || isRequestAbortedSnapshot(),
    cleanup: () => {
      req?.off('aborted', markClientAborted);
      req?.socket?.off('error', markSocketError);
      res?.off('finish', markResponseCompleted);
      res?.off('error', markResponseError);
      res?.off('close', markResponseClosed);
    }
  };
};
