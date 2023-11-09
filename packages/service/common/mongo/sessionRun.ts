import mongoose, { connectionMongo } from './index';

export async function mongoSessionTask(
  fn: (session: mongoose.mongo.ClientSession) => Promise<any>
) {
  const session = await connectionMongo.startSession();

  try {
    session.startTransaction();

    await fn(session);

    await session.commitTransaction();
    await session.endSession();
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    console.error(error);
    return Promise.reject(error);
  }
}
