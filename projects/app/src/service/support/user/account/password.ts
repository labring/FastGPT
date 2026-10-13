import { appEnv } from '@/env';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

export const checkPswExpired = ({ updateTime }: { updateTime?: Date }) => {
  const expiredMonth =
    getSystemInstanceConfig().auth.passwordExpiredMonth ?? appEnv.PASSWORD_EXPIRED_MONTH;

  if (expiredMonth === undefined || expiredMonth === null) {
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
