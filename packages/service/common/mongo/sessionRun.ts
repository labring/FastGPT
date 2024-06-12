import { addLog } from '../system/log';
import { connectionMongo, ClientSession } from './index';

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  const session = await connectionMongo.startSession();
  let committed = false;

  try {
    session.startTransaction();
    const result = await fn(session);

    await session.commitTransaction();
    committed = true;

    return result as T;
  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
    } else {
      addLog.warn('Un catch mongo session error', { error });
    }
    return Promise.reject(error);
  } finally {
    await session.endSession();
  }
};
