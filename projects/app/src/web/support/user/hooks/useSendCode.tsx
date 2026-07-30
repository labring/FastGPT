import { useState, useMemo } from 'react';
import { sendAuthCode, type UserVerificationPurpose } from '@/web/support/user/api';
import type { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { Box, type BoxProps, useDisclosure } from '@chakra-ui/react';
import SendCodeAuthModal from '@/components/support/user/safe/SendCodeAuthModal';
import { useMemoizedFn } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
let timer: NodeJS.Timeout;

export const useSendCode = ({
  type,
  purpose
}: {
  type: `${UserAuthTypeEnum}`;
  purpose: UserVerificationPurpose;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [codeCountDown, setCodeCountDown] = useState(0);

  const { runAsync: sendCode, loading: codeSending } = useRequest(
    async ({ username, captcha }: { username: string; captcha: string }) => {
      if (codeCountDown > 0) return;
      await sendAuthCode({
        username,
        type,
        purpose,
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
      refreshDeps: [codeCountDown, type, purpose]
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
            purpose={purpose}
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
