import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { checkFixedWindowQpmLimit } from '../../../../common/system/frequencyLimit/redisFixedWindow';

const CodeVerificationConsumeQpm = 10;
const CodeVerificationConsumeWindowSeconds = 60;

const assertVerificationFrequency = async ({
  account,
  scene,
  action,
  seconds = CodeVerificationConsumeWindowSeconds
}: {
  account: string;
  scene: string;
  action:
    | 'code:consume'
    | 'captcha:create'
    | 'captcha:consume'
    | 'password:create'
    | 'password:consume';
  seconds?: number;
}) => {
  const allowed = await checkFixedWindowQpmLimit({
    key: `account-verification:${action}:${scene}:${account}`,
    limit: CodeVerificationConsumeQpm,
    seconds
  });

  if (!allowed) {
    throw new UserError(UserErrEnum.verifyCodeTooFrequently);
  }
};

/** 按账号和场景限制验证码消费次数，错误和成功提交都占用同一固定窗口。 */
export const assertCodeVerificationConsumeFrequency = async ({
  account,
  scene
}: {
  account: string;
  scene: string;
}) => {
  return assertVerificationFrequency({
    account,
    scene,
    action: 'code:consume'
  });
};

/** 按账号和场景限制图片验证码生成次数。 */
export const assertCaptchaVerificationCreateFrequency = async ({
  account,
  scene
}: {
  account: string;
  scene: string;
}) => {
  return assertVerificationFrequency({ account, scene, action: 'captcha:create' });
};

/** 按账号和场景限制图片验证码确认次数。 */
export const assertCaptchaVerificationConsumeFrequency = async ({
  account,
  scene
}: {
  account: string;
  scene: string;
}) => {
  return assertVerificationFrequency({ account, scene, action: 'captcha:consume' });
};

/** 按账号限制预登录码生成次数，窗口由登录安全配置决定。 */
export const assertPasswordVerificationCreateFrequency = async ({
  account,
  scene,
  seconds
}: {
  account: string;
  scene: string;
  seconds: number;
}) => {
  return assertVerificationFrequency({ account, scene, action: 'password:create', seconds });
};

/** 按账号限制预登录码和密码的联合校验次数，窗口由登录安全配置决定。 */
export const assertPasswordVerificationConsumeFrequency = async ({
  account,
  scene,
  seconds
}: {
  account: string;
  scene: string;
  seconds: number;
}) => {
  return assertVerificationFrequency({ account, scene, action: 'password:consume', seconds });
};
