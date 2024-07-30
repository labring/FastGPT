import { timerLockTypeEnum } from './constants';

export type TimerLockSchemaType = {
  _id: string;
  timerId: string;
  expiredTime: Date;
};
