import { useState, useMemo, useCallback } from 'react';
import { sendAuthCode } from '@/api/user';
import { UserAuthTypeEnum } from '@/constants/common';
import { useToast } from './useToast';
import { feConfigs } from '@/store/static';
import { getErrText } from '@/utils/tools';

let timer: any;

export const useSendCode = () => {
  const { toast } = useToast();
  const [codeSending, setCodeSending] = useState(false);
  const [codeCountDown, setCodeCountDown] = useState(0);
  const sendCodeText = useMemo(() => {
    if (codeCountDown >= 10) {
      return `${codeCountDown}s后重新获取`;
    }
    if (codeCountDown > 0) {
      return `0${codeCountDown}s后重新获取`;
    }
    return '获取验证码';
  }, [codeCountDown]);

  const sendCode = useCallback(
    async ({ username, type }: { username: string; type: `${UserAuthTypeEnum}` }) => {
      setCodeSending(true);
      try {
        await sendAuthCode({
          username,
          type,
          googleToken: await getClientToken(feConfigs.googleClientVerKey)
        });
        setCodeCountDown(60);
        timer = setInterval(() => {
          setCodeCountDown((val) => {
            if (val <= 0) {
              clearInterval(timer);
            }
            return val - 1;
          });
        }, 1000);
        toast({
          title: '验证码已发送',
          status: 'success',
          position: 'top'
        });
      } catch (error: any) {
        toast({
          title: getErrText(error, '验证码发送异常'),
          status: 'error'
        });
      }
      setCodeSending(false);
    },
    [toast]
  );

  return {
    codeSending,
    sendCode,
    sendCodeText,
    codeCountDown
  };
};

export function getClientToken(googleClientVerKey?: string) {
  if (!googleClientVerKey || typeof window.grecaptcha === 'undefined' || !window.grecaptcha?.ready)
    return '';
  return new Promise<string>((resolve, reject) => {
    window.grecaptcha.ready(async () => {
      try {
        const token = await window.grecaptcha.execute(googleClientVerKey, {
          action: 'submit'
        });
        resolve(token);
      } catch (error) {
        reject(error);
      }
    });
  });
}
