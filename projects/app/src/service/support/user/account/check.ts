export function checkPsw({ updateTime }: { updateTime: Date | undefined }) {
  console.log('updateTime', updateTime);
  if (!updateTime) {
    return true;
  }
  const time = new Date().getTime() - new Date(updateTime).getTime();

  const pswUpdateTime = process.env.PASSWORD_UPDATETIME ? process.env.PASSWORD_UPDATETIME : '0';
  if (pswUpdateTime !== '0') {
    return time > 1000 * 60 * 60 * 24 * 30 * Number(pswUpdateTime);
  }
  return false;
}
