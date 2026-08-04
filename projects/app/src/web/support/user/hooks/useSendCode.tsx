import { useState, useMemo } from 'react';
import { sendAuthCode } from '@/web/support/user/api';
import type {
  VerificationCodePurposeForType,
  VerificationCodeType
} from '@fastgpt/global/support/user/account/verification/type';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { Box, type BoxProps, useDisclosure } from '@chakra-ui/react';
import SendCodeAuthModal from '@/components/support/user/safe/SendCodeAuthModal';
import { useMemoizedFn } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
let timer: NodeJS.Timeout;

type UseSendCodeParams = {
  [T in VerificationCodeType]: {
    type: T;
    purpose: VerificationCodePurposeForType<T>;
  };
}[VerificationCodeType];

export const useSendCode = (params: UseSendCodeParams) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [codeCountDown, setCodeCountDown] = useState(0);

  const { runAsync: sendCode, loading: codeSending } = useRequest(
    async ({ username, captcha }: { username: string; captcha: string }) => {
      if (codeCountDown > 0) return;
      await sendAuthCode({
        username,
        ...params,
        captcha,
        lang: i18n.language as LangEnum
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
    },
    {
      successToast: t('user:password.code_sended'),
      errorToast: t('user:password.code_send_error'),
      refreshDeps: [codeCountDown, params.type, params.purpose]
    }
  );

  const sendCodeText = useMemo(() => {
    if (codeSending) return t('common:support.user.auth.Sending Code');
    if (codeCountDown >= 10) {
      return `${codeCountDown}${t('common:support.user.auth.get_code_again')}`;
    }
    if (codeCountDown > 0) {
      return `0${codeCountDown}${t('common:support.user.auth.get_code_again')}`;
    }
    return t('common:support.user.auth.get_code');
  }, [codeCountDown, codeSending, t]);

  const {
    isOpen: openCodeAuthModal,
    onOpen: onOpenCodeAuthModal,
    onClose: onCloseCodeAuthModal
  } = useDisclosure();

  const SendCodeBox = useMemoizedFn(({ username, ...styles }: BoxProps & { username: string }) => {
    return (
      <>
        <Box
          position={'absolute'}
          right={3}
          zIndex={1}
          fontSize={'mini'}
          fontWeight={'medium'}
          {...styles}
          {...(codeCountDown > 0
            ? {
                color: 'myGray.500'
              }
            : {
                color: 'primary.700',
                cursor: 'pointer',
                onClick: () => {
                  if (!username) {
                    toast({
                      status: 'warning',
                      title: t('common:error.username_empty')
                    });
                  } else {
                    onOpenCodeAuthModal();
                  }
                }
              })}
        >
          {sendCodeText}
        </Box>
        {openCodeAuthModal && (
          <SendCodeAuthModal
            onClose={onCloseCodeAuthModal}
            username={username}
            purpose={params.purpose}
            onSending={codeSending}
            onSendCode={sendCode}
          />
        )}
      </>
    );
  });

  return {
    codeSending,
    sendCode,
    sendCodeText,
    codeCountDown,
    SendCodeBox,
    openCodeAuthModal
  };
};
