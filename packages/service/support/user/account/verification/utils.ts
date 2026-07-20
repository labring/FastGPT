import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { checkFixedWindowQpmLimit } from '../../../../common/system/frequencyLimit/redisFixedWindow';

const CodeVerificationConsumeQpm = 10;
const CodeVerificationConsumeWindowSeconds = 60;

/** 将用户输入转成可安全用于锚定正则的字面量。 */
export const escapeVerificationCodeForRegExp = (code: string) =>
  code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 构造兼容历史验证码大小写行为的精确匹配条件。 */
export const buildVerificationCodeFilter = ({
  code,
  caseInsensitive = false
}: {
  code: string;
  caseInsensitive?: boolean;
}) =>
  caseInsensitive
    ? { $regex: new RegExp(`^${escapeVerificationCodeForRegExp(code)}$`, 'i') }
    : code;

/**
 * 按账号和场景累计验证码提交次数，限制同一固定分钟窗口内最多验证 10 次。
 * 该检查必须在查询验证码前执行，使错误和成功提交都占用尝试次数。
 */
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
