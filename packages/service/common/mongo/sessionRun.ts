import { connectionMongo, ClientSession } from './index';

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  const session = await connectionMongo.startSession();

  try {
    session.startTransaction();
    const result = await fn(session);

    await session.commitTransaction();

    return result as T;
  } catch (error) {
    await session.abortTransaction();
    return Promise.reject(error);
  } finally {
    await session.endSession();
  }
};
