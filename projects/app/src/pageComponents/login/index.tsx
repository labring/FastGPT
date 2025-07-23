import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  useDisclosure
} from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useLocalStorageState } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { GET } from '@/web/common/api/request';
import { getDocPath } from '@/web/common/system/doc';
import LoginForm from '@/pageComponents/login/LoginForm/LoginForm';
import { getBdVId } from '@/web/support/marketing/utils';

const RegisterForm = dynamic(() => import('@/pageComponents/login/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('@/pageComponents/login/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('@/pageComponents/login/LoginForm/WechatForm'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ipDetectURL = 'https://qifu-api.baidubce.com/ip/local/geo/v1/district';

// 登录逻辑Hook
export const useLoginLogic = (options: {
  onSuccess?: (res: ResLogin) => void;
  chineseRedirectUrl?: string;
}) => {
  const { onSuccess, chineseRedirectUrl } = options;
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const { setLastChatAppId } = useChatStore();

  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}` | null>(null);

  // Cookie相关
  const {
    isOpen: isOpenCookiesDrawer,
    onOpen: onOpenCookiesDrawer,
    onClose: onCloseCookiesDrawer
  } = useDisclosure();
  const cookieVersion = '1';
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');

  // 社区模态框
  const {
    isOpen: isCommunityOpen,
    onOpen: onCommunityOpen,
    onClose: onCommunityClose
  } = useDisclosure();

  // 中国IP重定向
  const {
    isOpen: isOpenRedirect,
    onOpen: onOpenRedirect,
    onClose: onCloseRedirect
  } = useDisclosure();
  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

  // IP检测
  const checkIpInChina = useCallback(async () => {
    try {
      const res = await GET<any>(ipDetectURL);
      const country = res?.country;
      if (
        country &&
        country === '中国' &&
        res.prov !== '中国香港' &&
        res.prov !== '中国澳门' &&
        res.prov !== '中国台湾'
      ) {
        onOpenRedirect();
      }
    } catch (error) {
      console.log(error);
    }
  }, [onOpenRedirect]);

  // 登录成功处理
  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setUserInfo(res.user);
      onSuccess?.(res);
    },
    [setUserInfo, onSuccess]
  );

  // 初始化逻辑
  const initLoginLogic = useCallback(() => {
    // Cookie版本检查
    if (localCookieVersion !== cookieVersion) {
      onOpenCookiesDrawer();
    }

    // 中国IP检测
    if (chineseRedirectUrl && showRedirect) {
      checkIpInChina();
    }

    // 设置页面类型
    const bd_vid = getBdVId();
    if (bd_vid) {
      setPageType(LoginPageTypeEnum.passwordLogin);
      return;
    }

    setPageType(
      feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
    );

    // 重置聊天状态
    setLastChatAppId('');
  }, [
    localCookieVersion,
    cookieVersion,
    onOpenCookiesDrawer,
    chineseRedirectUrl,
    showRedirect,
    checkIpInChina,
    feConfigs?.oauth?.wechat,
    setLastChatAppId
  ]);

  // 动态组件
  const DynamicComponent = useMemo(() => {
    if (!pageType) return null;

    const TypeMap = {
      [LoginPageTypeEnum.passwordLogin]: LoginForm,
      [LoginPageTypeEnum.register]: RegisterForm,
      [LoginPageTypeEnum.forgetPassword]: ForgetPasswordForm,
      [LoginPageTypeEnum.wechat]: WechatForm
    };

    const Component = TypeMap[pageType];
    if (!Component) return null;

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }, [pageType, loginSuccess]);

  return {
    // State
    pageType,
    setPageType,
    feConfigs,
    t,

    // Handlers
    loginSuccess,
    initLoginLogic,

    // Components
    DynamicComponent,

    // Community Modal
    isCommunityOpen,
    onCommunityOpen,
    onCommunityClose,

    // Cookies Drawer
    isOpenCookiesDrawer,
    onOpenCookiesDrawer,
    onCloseCookiesDrawer,
    cookieVersion,
    localCookieVersion,
    setLocalCookieVersion,

    // Redirect Drawer
    isOpenRedirect,
    onOpenRedirect,
    onCloseRedirect,
    showRedirect,
    setShowRedirect,
    chineseRedirectUrl
  };
};

// 重定向抽屉组件
export const RedirectDrawer = ({
  isOpen,
  onClose,
  disableDrawer,
  onRedirect
}: {
  isOpen: boolean;
  onClose: () => void;
  disableDrawer: () => void;
  onRedirect: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Drawer placement="bottom" size={'xs'} isOpen={isOpen} onClose={onClose}>
      <DrawerOverlay backgroundColor={'rgba(0,0,0,0.2)'} />
      <DrawerContent py={'1.75rem'} px={'3rem'}>
        <DrawerCloseButton size={'sm'} />
        <Flex align={'center'} justify={'space-between'}>
          <Box>
            <Box color={'myGray.900'} fontWeight={'500'} fontSize={'1rem'}>
              {t('login:Chinese_ip_tip')}
            </Box>
            <Box
              color={'primary.700'}
              fontWeight={'500'}
              fontSize={'1rem'}
              textDecorationLine={'underline'}
              cursor={'pointer'}
              onClick={disableDrawer}
            >
              {t('login:no_remind')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={onRedirect}>
            {t('login:redirect')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

// Cookie抽屉组件
export const CookiesDrawer = ({
  onClose,
  onAgree
}: {
  onClose: () => void;
  onAgree: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Drawer placement="bottom" size={'xs'} isOpen={true} onClose={onClose}>
      <DrawerOverlay backgroundColor={'rgba(0,0,0,0.2)'} />
      <DrawerContent py={'1.75rem'} px={'3rem'}>
        <DrawerCloseButton size={'sm'} />
        <Flex align={'center'} justify={'space-between'}>
          <Box>
            <Box color={'myGray.900'} fontWeight={'500'} fontSize={'1rem'}>
              {t('login:cookies_tip')}
            </Box>
            <Box
              color={'primary.700'}
              fontWeight={'500'}
              fontSize={'1rem'}
              textDecorationLine={'underline'}
              cursor={'pointer'}
              w={'fit-content'}
              onClick={() => window.open(getDocPath('/docs/agreement/privacy/'), '_blank')}
            >
              {t('login:privacy_policy')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={onAgree}>
            {t('login:agree')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

// 登录容器组件 - 专注于核心登录功能，不包含语言选择器
export const LoginContainer = ({
  onSuccess,
  chineseRedirectUrl,
  children
}: {
  onSuccess?: (res: ResLogin) => void;
  chineseRedirectUrl?: string;
  children?: React.ReactNode;
}) => {
  const loginLogic = useLoginLogic({
    onSuccess,
    chineseRedirectUrl
  });

  const {
    t,
    pageType,
    feConfigs,
    DynamicComponent,
    isCommunityOpen,
    onCommunityOpen,
    onCommunityClose,
    isOpenCookiesDrawer,
    onCloseCookiesDrawer,
    cookieVersion,
    setLocalCookieVersion,
    isOpenRedirect,
    onCloseRedirect,
    showRedirect,
    setShowRedirect,
    chineseRedirectUrl: redirectUrl
  } = loginLogic;

  return (
    <>
      {/* Google reCAPTCHA Script */}
      {feConfigs.googleClientVerKey && (
        <Script
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${feConfigs.googleClientVerKey}`}
        />
      )}

      <Box position="relative" w="full" h="full">
        {/* main content area */}
        <Box w={['100%', '380px']} minH={['100vh', '600px']} flex={'1 0 0'}>
          {pageType && DynamicComponent ? DynamicComponent : <Loading fixed={false} />}
        </Box>

        {/* custom content */}
        {children}

        {/* help link for login */}
        {feConfigs?.concatMd && (
          <Box
            mt={
              pageType === LoginPageTypeEnum.register ||
              pageType === LoginPageTypeEnum.forgetPassword
                ? 10
                : 4
            }
            color={'primary.700'}
            fontSize={'mini'}
            fontWeight={'medium'}
            cursor={'pointer'}
            textAlign={'center'}
            onClick={onCommunityOpen}
          >
            {t('common:support.user.login.can_not_login')}
          </Box>
        )}
      </Box>

      {/* 无法登录帮助链接 */}
      {feConfigs?.concatMd && (
        <Box
          mt={8}
          color={'primary.700'}
          fontSize={'mini'}
          fontWeight={'medium'}
          cursor={'pointer'}
          textAlign={'center'}
          onClick={onCommunityOpen}
        >
          {t('common:support.user.login.can_not_login')}
        </Box>
      )}

      {/* 自定义内容 */}
      {children}

      {/* 社区模态框 */}
      {isCommunityOpen && <CommunityModal onClose={onCommunityClose} />}

      {/* 中国IP重定向抽屉 */}
      {showRedirect && redirectUrl && (
        <RedirectDrawer
          isOpen={isOpenRedirect}
          onClose={onCloseRedirect}
          onRedirect={() => window.open(redirectUrl, '_self')}
          disableDrawer={() => setShowRedirect(false)}
        />
      )}

      {/* Cookie同意抽屉 */}
      {isOpenCookiesDrawer && (
        <CookiesDrawer
          onAgree={() => {
            setLocalCookieVersion(cookieVersion);
            onCloseCookiesDrawer();
          }}
          onClose={onCloseCookiesDrawer}
        />
      )}
    </>
  );
};

export default LoginContainer;
