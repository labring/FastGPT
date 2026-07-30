import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { checkFixedWindowQpmLimit } from '../../../../common/system/frequencyLimit/redisFixedWindow';

const CodeVerificationConsumeQpm = 10;
const CodeVerificationConsumeWindowSeconds = 60;

/** 按账号和场景限制验证码消费次数，错误和成功提交都占用同一固定窗口。 */
export const assertCodeVerificationConsumeFrequency = async ({
  account,
  scene
}: {
  account: string;
  scene: string;
}) => {
  const allowed = await checkFixedWindowQpmLimit({
    key: `account-verification:code:consume:${scene}:${account}`,
    limit: CodeVerificationConsumeQpm,
    seconds: CodeVerificationConsumeWindowSeconds
  });

  if (!allowed) {
    throw new UserError(UserErrEnum.verifyCodeTooFrequently);
  }
};
