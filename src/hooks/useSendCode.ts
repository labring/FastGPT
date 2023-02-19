import { useState, useMemo, useCallback } from 'react';
import { sendCodeToEmail } from '@/api/user';
import { EmailTypeEnum } from '@/constants/common';
import { useToast } from '@chakra-ui/react';
let timer: any;

export const useSendCode = () => {
  const toast = useToast({
    position: 'top',
    duration: 2000
  });
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
    async ({ email, type }: { email: string; type: `${EmailTypeEnum}` }) => {
      setCodeSending(true);
      try {
        await sendCodeToEmail({
          email,
          type
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
      } catch (error) {
        typeof error === 'string' &&
          toast({
            title: error,
            status: 'error',
            position: 'top'
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
