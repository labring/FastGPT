import React, { useState, useCallback, useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import { useTranslation } from 'next-i18next';
import ChineseRedirectModal from './components/ChineseRedirectModal';
import CookieConsentModal from './components/CookieConsentModal';
import LoginFormPanel from './components/LoginFormPanel';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';

type LoginSuccessHandler = (res: LoginSuccessResponseType) => void | Promise<void>;

const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

// login container component
export const LoginContainer = ({
  children,
  onSuccess
}: {
  children?: React.ReactNode;
  onSuccess: LoginSuccessHandler;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { resetChatCache } = useChatStore();

  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}`>(LoginPageTypeEnum.passwordLogin);
  const [showCommunityModal, setShowCommunityModal] = useState(false);

  // login success handler
  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      await onSuccess?.(res);
    },
    [onSuccess]
  );

  // initialization logic
  useEffect(() => {
    // reset chat state
    resetChatCache();
  }, [feConfigs?.oauth?.wechat, resetChatCache]);

  return (
    <>
      {/* Google reCAPTCHA Script */}
      {feConfigs.googleClientVerKey && (
        <Script
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${feConfigs.googleClientVerKey}`}
        />
      )}

      <Flex
        my={['', pageType === LoginPageTypeEnum.wechat ? '-15px' : '']}
        position="relative"
        w="full"
        flex={'1 0 0'}
        flexDirection={'column'}
      >
        {/* main content area */}
        <LoginFormPanel pageType={pageType} setPageType={setPageType} loginSuccess={loginSuccess} />

        {/* custom content */}
        {children}

        {/* help link for login */}
        {feConfigs?.concatMd && (
          <Box
            mt={[9, '6']}
            color={'primary.700'}
            fontSize={'mini'}
            fontWeight={'medium'}
            cursor={'pointer'}
            textAlign={'center'}
            onClick={() => setShowCommunityModal(true)}
          >
            {t('common:support.user.login.can_not_login')}
          </Box>
        )}
      </Flex>

      <CookieConsentModal />
      <ChineseRedirectModal />

      {/* Community modal */}
      {showCommunityModal && <CommunityModal onClose={() => setShowCommunityModal(false)} />}
    </>
  );
};

export default LoginContainer;
