import { appEnv } from '@/env';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

export const checkPswExpired = ({ updateTime }: { updateTime?: Date }) => {
  // passwordExpiredMonth 是 nullable 字段：null 是"永不过期"的显式语义，
  // 不能用 ?? 兜底——否则 Admin 显式改为永不过期(null) 会被 env 初值复活。
  // 只有 undefined（快照叶子缺省，仅测试种子/未初始化场景）才回落到 env。
  const configured = getSystemInstanceConfig().auth.passwordExpiredMonth;
  const expiredMonth = configured === undefined ? appEnv.PASSWORD_EXPIRED_MONTH : configured;

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
