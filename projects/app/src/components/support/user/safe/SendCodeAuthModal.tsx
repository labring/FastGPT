import React from 'react';
import {
  getCaptchaPic as getDefaultCaptchaPic,
  type UserVerificationPurpose
} from '@/web/support/user/api';
import type { PuzzleCaptchaChallenge } from '@fastgpt/global/support/user/account/captcha/type';
import PuzzleCaptchaModal from './PuzzleCaptchaModal';

/** 登录二次验证注入 Challenge 作用域的图像验证获取方式，其他场景按账号获取。 */
export type GetCaptchaPic = () => Promise<PuzzleCaptchaChallenge>;

/** 发送短信或邮箱验证码之前必须通过图像验证，服务端仍会校验一次性凭证。 */
const SendCodeAuthModal = ({
  username,
  purpose,
  onClose,
  onSendCode,
  getCaptchaPic
}: {
  username: string;
  purpose: UserVerificationPurpose;
  onClose: () => void;
  onSendCode: (params: { username: string; captcha: string }) => Promise<void>;
  getCaptchaPic?: GetCaptchaPic;
}) => (
  <PuzzleCaptchaModal
    purpose={purpose}
    getCaptcha={() => getCaptchaPic?.() ?? getDefaultCaptchaPic(username, purpose)}
    onClose={onClose}
    onVerified={async (captcha) => {
      await onSendCode({ username, captcha });
      onClose();
    }}
  />
);

export default SendCodeAuthModal;
