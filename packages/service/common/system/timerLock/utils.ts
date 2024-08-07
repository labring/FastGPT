import { MongoTimerLock } from './schema';
import { addMinutes } from 'date-fns';

/* 
  利用唯一健，使得同一时间只有一个任务在执行，后创建的锁，会因唯一健创建失败，从而无法继续执行任务
*/
export const checkTimerLock = async ({
  timerId,
  lockMinuted
}: {
  timerId: string;
  lockMinuted: number;
}) => {
  try {
    await MongoTimerLock.create({
      timerId,
      expiredTime: addMinutes(new Date(), lockMinuted)
    });

    return true;
  } catch (error) {
    return false;
  }
};
