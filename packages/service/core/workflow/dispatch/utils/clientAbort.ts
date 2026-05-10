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

  const responseFinished = () =>
    responseCompleted || !!(res?.writableEnded || res?.writableFinished);
  const responseWritableAborted = () =>
    !!(res as ResponseWithWritableAborted | undefined)?.writableAborted;
  const isAbortedSnapshot = () => {
    if (responseFinished()) return false;

    return !!(
      req?.aborted ||
      res?.closed ||
      res?.destroyed ||
      responseWritableAborted() ||
      res?.errored
    );
  };
  const markResponseCompleted = () => {
    responseCompleted = true;
  };
  const markClientAborted = () => {
    if (!responseFinished()) {
      clientAborted = true;
    }
  };

  req?.on('aborted', markClientAborted);
  // Socket close is connection-level and can outlive the current response lifecycle.
  // Use response close/error plus request aborted to avoid stopping workflow on connection churn.
  res?.on('finish', markResponseCompleted);
  res?.on('close', markClientAborted);
  res?.on('error', markClientAborted);

  return {
    isClientAborted: () => clientAborted || isAbortedSnapshot(),
    cleanup: () => {
      req?.off('aborted', markClientAborted);
      res?.off('finish', markResponseCompleted);
      res?.off('close', markClientAborted);
      res?.off('error', markClientAborted);
    }
  };
};
