import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { checkRedisFrequencyLimit } from '../../../../common/system/frequencyLimit/redisFixedWindow';

const CodeVerificationConsumeQpm = 10;
const CodeVerificationConsumeWindowSeconds = 60;

const assertVerificationFrequency = async ({
  account,
  scene,
  action,
  limit = CodeVerificationConsumeQpm,
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
  limit?: number;
  seconds?: number;
}) => {
  const allowed = await checkRedisFrequencyLimit({
    group: 'account-verification',
    id: `${action}:${scene}:${account}`,
    limit,
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

/** 按账号限制每分钟预登录码生成次数。 */
export const assertPasswordVerificationCreateFrequency = async ({
  account,
  scene,
  limit
}: {
  account: string;
  scene: string;
  limit: number;
}) => {
  return assertVerificationFrequency({ account, scene, action: 'password:create', limit });
};

/** 按账号限制每分钟预登录码和密码的联合校验次数。 */
export const assertPasswordVerificationConsumeFrequency = async ({
  account,
  scene,
  limit
}: {
  account: string;
  scene: string;
  limit: number;
}) => {
  return assertVerificationFrequency({ account, scene, action: 'password:consume', limit });
};
