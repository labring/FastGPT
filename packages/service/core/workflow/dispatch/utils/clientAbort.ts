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

  const responseFinished = () => !!(res?.writableEnded || res?.writableFinished);
  const responseWritableAborted = () =>
    !!(res as ResponseWithWritableAborted | undefined)?.writableAborted;
  const isAbortedSnapshot = () => {
    if (responseFinished()) return false;

    return !!(
      req?.aborted ||
      req?.socket?.destroyed ||
      res?.closed ||
      res?.destroyed ||
      responseWritableAborted() ||
      res?.errored
    );
  };
  const markClientAborted = () => {
    if (!responseFinished()) {
      clientAborted = true;
    }
  };

  req?.on('aborted', markClientAborted);
  req?.socket?.on('close', markClientAborted);
  res?.on('close', markClientAborted);
  res?.on('error', markClientAborted);

  return {
    isClientAborted: () => clientAborted || isAbortedSnapshot(),
    cleanup: () => {
      req?.off('aborted', markClientAborted);
      req?.socket?.off('close', markClientAborted);
      res?.off('close', markClientAborted);
      res?.off('error', markClientAborted);
    }
  };
};
