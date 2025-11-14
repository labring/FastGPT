export const checkPswExpired = ({ updateTime }: { updateTime?: Date }) => {
  if (!process.env.PASSWORD_EXPIRED_MONTH) {
    return false;
  }

  if (!updateTime) {
    return true;
  }

  const expiredMonth = Number(process.env.PASSWORD_EXPIRED_MONTH);
  if (expiredMonth === 0) {
    return false;
  }

  const time = new Date().getTime() - new Date(updateTime).getTime();

  return time > 1000 * 60 * 60 * 24 * 30 * expiredMonth;
};
