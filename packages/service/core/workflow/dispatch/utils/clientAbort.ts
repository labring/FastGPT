import type { NextApiResponse } from 'next';
import type { IncomingMessage } from 'node:http';

type ResponseWithWritableAborted = NextApiResponse & {
  writableAborted?: boolean;
};

export const createClientAbortTracker = ({
  req,
  res
}: {
  req?: IncomingMessage;
  res?: NextApiResponse;
}) => {
  let clientAborted = false;
  let responseCompleted = !!(res?.writableEnded || res?.writableFinished);

  // For workflow stopping, "client aborted" means the current response can no longer be written.
  // It is intentionally broader than a strict user-initiated cancel audit signal.
  const responseFinished = () =>
    responseCompleted || !!(res?.writableEnded || res?.writableFinished);
  const responseWritableAborted = () =>
    !!(res as ResponseWithWritableAborted | undefined)?.writableAborted;
  const hasExplicitAbort = () => !!(req?.aborted || responseWritableAborted());
  const hasBrokenConnection = () => !!(req?.socket?.destroyed || res?.destroyed || res?.errored);
  const isAbortedSnapshot = () => {
    // A normal completed response may also emit close later. Do not treat that as abort.
    if (responseFinished()) return false;

    return hasExplicitAbort() || hasBrokenConnection();
  };
  const markResponseCompleted = () => {
    responseCompleted = true;
  };
  const markClientAborted = () => {
    if (!responseFinished()) {
      clientAborted = true;
    }
  };
  const markClientAbortedIfConnectionBroken = () => {
    if (!responseFinished() && (hasExplicitAbort() || hasBrokenConnection())) {
      clientAborted = true;
    }
  };

  req?.on('aborted', markClientAborted);
  // close itself is too broad; only stop when paired with explicit abort or a broken connection.
  req?.socket?.on('close', markClientAbortedIfConnectionBroken);
  res?.on('finish', markResponseCompleted);
  res?.on('close', markClientAbortedIfConnectionBroken);
  res?.on('error', markClientAborted);

  return {
    isClientAborted: () => clientAborted || isAbortedSnapshot(),
    cleanup: () => {
      req?.off('aborted', markClientAborted);
      req?.socket?.off('close', markClientAbortedIfConnectionBroken);
      res?.off('finish', markResponseCompleted);
      res?.off('close', markClientAbortedIfConnectionBroken);
      res?.off('error', markClientAborted);
    }
  };
};
