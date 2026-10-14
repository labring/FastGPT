import { appEnv } from '@/env';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

export const checkPswExpired = ({ updateTime }: { updateTime?: Date }) => {
  // passwordExpiredMonth 是 nullable 字段：null 是"永不过期"的显式语义，
  // 不能用 ?? 兜底——否则 Admin 显式改为永不过期(null) 会被 env 初值复活。
  // 只有 undefined（快照叶子缺省，仅测试种子/未初始化场景）才回落到 env。
  const configured = getSystemInstanceConfig().auth.passwordExpiredMonth;
  // 0 与 null 同义（永不过期）：先归一再判断，否则 PASSWORD_EXPIRED_MONTH=0
  // 且用户缺 passwordUpdateTime 时，!updateTime 分支会先返回 true 强制改密，
  // 与"配置说永不过期"相互矛盾。
  const rawExpiredMonth = configured === undefined ? appEnv.PASSWORD_EXPIRED_MONTH : configured;
  const expiredMonth = rawExpiredMonth === 0 ? null : rawExpiredMonth;

  if (expiredMonth === undefined || expiredMonth === null) {
    return false;
  }

  if (!updateTime) {
    return true;
  }

  const time = new Date().getTime() - new Date(updateTime).getTime();

  return time > 1000 * 60 * 60 * 24 * 30 * expiredMonth;
};
