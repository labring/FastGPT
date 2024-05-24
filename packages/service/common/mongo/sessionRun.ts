import { connectionMongo, ClientSession } from './index';

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  const session = await connectionMongo.startSession();
  session.startTransaction();

  try {
    const result = await fn(session);

    await session.commitTransaction();
    await session.endSession();

    return result as T;
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    return Promise.reject(error);
  }
};
