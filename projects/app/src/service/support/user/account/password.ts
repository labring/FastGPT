import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';

export const checkPswExpired = ({ updateTime }: { updateTime?: Date }) => {
  // ENV 仅在迁移时写入；null 表示永不过期，运行期不再回落到旧 ENV。
  const configured = getSystemInstanceConfig().auth.passwordExpiredMonth;
  logInstanceConfigRead({
    callsite: 'runtime.app.user.account.password.checkPswExpired',
    fields: [
      {
        path: 'auth.passwordExpiredMonth',
        value: configured
      }
    ]
  });
  const expiredMonth = configured === 0 ? null : configured;

  if (expiredMonth === undefined || expiredMonth === null) {
    return false;
  }

  if (!updateTime) {
    return true;
  }

  const time = new Date().getTime() - new Date(updateTime).getTime();

  return time > 1000 * 60 * 60 * 24 * 30 * expiredMonth;
};
