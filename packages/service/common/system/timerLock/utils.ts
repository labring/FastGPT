import { type ClientSession } from '../../mongo';
import { MongoTimerLock } from './schema';
import { addMinutes } from 'date-fns';

/*
  利用唯一健，使得同一时间只有一个任务在执行，后创建的锁，会因唯一健创建失败，从而无法继续执行任务
*/
export const checkTimerLock = async ({
  timerId,
  lockMinuted,
  session
}: {
  timerId: string;
  lockMinuted: number;
  session?: ClientSession;
}) => {
  try {
    await MongoTimerLock.create(
      [
        {
          timerId,
          expiredTime: addMinutes(new Date(), lockMinuted)
        }
      ],
      { session, ordered: true }
    );

    return true;
  } catch (error) {
    return false;
  }
};

export const cleanTimerLock = async ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) => {
  // Match timerId pattern where lockId (last segment) equals teamId
  await MongoTimerLock.deleteMany(
    {
      timerId: new RegExp(`--${teamId}$`)
    },
    { session }
  );
};
