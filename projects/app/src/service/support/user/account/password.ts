import { appEnv } from '@/env';

export const checkPswExpired = ({ updateTime }: { updateTime?: Date }) => {
  const expiredMonth = appEnv.PASSWORD_EXPIRED_MONTH;

  if (expiredMonth === undefined) {
    return false;
  }

  if (!updateTime) {
    return true;
  }

  if (expiredMonth === 0) {
    return false;
  }

  const time = new Date().getTime() - new Date(updateTime).getTime();

  return time > 1000 * 60 * 60 * 24 * 30 * expiredMonth;
};
