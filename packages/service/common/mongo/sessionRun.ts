import { connectionMongo, ClientSession } from './index';

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  const session = await connectionMongo.startSession();
  session.startTransaction();

  try {
    const result = await fn(session);

    await session.commitTransaction();
    session.endSession();

    return result as T;
  } catch (error) {
    console.log(error);

    await session.abortTransaction();
    session.endSession();
    return Promise.reject(error);
  }
};
