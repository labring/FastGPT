import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import {
  resolveAutoLoginProvider,
  resolveInitialLoginPageType
} from '@/web/support/user/login/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import ChineseRedirectModal from './components/ChineseRedirectModal';
import CookieConsentModal from './components/CookieConsentModal';
import LoginFormPanel from './components/LoginFormPanel';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRouter } from 'next/router';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { useLoginMethods } from './LoginForm/useLoginMethods';
import LoginGuideLink from './LoginForm/LoginGuideLink';

type LoginSuccessHandler = (res: LoginSuccessResponseType) => void | Promise<void>;

/** 登录容器先完成自动跳转判断，再暴露可见页面，避免方式选择页短暂闪现。 */
export const LoginContainer = ({
  children,
  onSuccess
}: {
  children?: React.ReactNode;
  onSuccess: LoginSuccessHandler;
}) => {
  const router = useRouter();
  const { initd, feConfigs } = useSystemStore();
  const { resetChatCache } = useChatStore();
  const { isPc } = useSystem();
  const loginGuideDocUrl = feConfigs?.loginGuideDocUrl?.trim();
  const initializedRef = useRef(false);

  const [selectedPageType, setPageType] = useState<`${LoginPageTypeEnum}`>();
  const [autoLoginFailed, setAutoLoginFailed] = useState(false);
  const { methods, startLogin } = useLoginMethods({
    mode: 'selection',
    pageType: LoginPageTypeEnum.methodSelection,
    setPageType
  });
  const rootLogin = router.query.rootLogin === '1';
  const isWecomTerminal = typeof navigator === 'undefined' ? false : checkIsWecomTerminal();
  const initialPageType = resolveInitialLoginPageType({
    rootLogin,
    ssoAvailable: Boolean(feConfigs?.sso?.url),
    disablePasswordForSsoUsers: feConfigs?.sso?.disablePasswordForSsoUsers === true
  });
  const autoLoginProvider = resolveAutoLoginProvider({
    rootLogin,
    ssoAvailable: Boolean(feConfigs?.sso?.url),
    ssoAutoLogin: feConfigs?.sso?.autoLogin === true,
    wecomAvailable: Boolean(feConfigs?.oauth?.wecom),
    isWecomTerminal,
    canWecomTerminalAutoRedirect: !isWecomTerminal || feConfigs?.wecomLoginAutoRedirect === true
  });
  const autoLoginMethod = methods.find(
    (method) => method.type === 'oauth' && method.provider === autoLoginProvider
  );
  const pageType =
    selectedPageType ??
    (initd && router.isReady && (!autoLoginMethod || autoLoginFailed)
      ? initialPageType
      : undefined);

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      await onSuccess?.(res);
    },
    [onSuccess]
  );

  useEffect(() => {
    resetChatCache();
  }, [feConfigs?.oauth?.wechat, resetChatCache]);

  useEffect(() => {
    if (!initd || !router.isReady || initializedRef.current) return;
    initializedRef.current = true;

    if (autoLoginMethod) {
      void startLogin(autoLoginMethod).catch(() => setAutoLoginFailed(true));
    }
  }, [autoLoginMethod, initd, router.isReady, startLogin]);

  return (
    <>
      <Flex
        my={['', pageType === LoginPageTypeEnum.wechat ? '-15px' : '']}
        position="relative"
        w="full"
        flex={['1 0 0', '0 0 auto']}
        flexDirection="column"
        justifyContent={['center', 'flex-start']}
      >
        {!isPc && (
          <Box mb={8} alignSelf="flex-start">
            <I18nLngSelector />
          </Box>
        )}

        <LoginFormPanel
          pageType={pageType}
          setPageType={setPageType}
          loginSuccess={loginSuccess}
          reserveLoginGuideSpace={
            pageType === LoginPageTypeEnum.passwordLogin && Boolean(loginGuideDocUrl)
          }
        />

        {children}

        {pageType === LoginPageTypeEnum.passwordLogin && <LoginGuideLink mt={8} />}
      </Flex>

      <CookieConsentModal />
      <ChineseRedirectModal />
    </>
  );
};

export default LoginContainer;
