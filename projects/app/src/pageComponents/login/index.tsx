import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Center,
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

// 抽屉类型枚举
enum DrawerTypeEnum {
  NONE = 'none',
  COOKIES = 'cookies',
  REDIRECT = 'redirect'
}

// 登录逻辑Hook
export const useLoginLogic = (options: {
  onSuccess?: (res: ResLogin) => void;
  chineseRedirectUrl?: string;
  autoInit?: boolean;
  enabled?: boolean;
}) => {
  const { onSuccess, chineseRedirectUrl, autoInit = true, enabled = true } = options;
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo, setUserInfo } = useUserStore();
  const { setLastChatAppId } = useChatStore();

  // 统一状态管理
  const [isInitializing, setIsInitializing] = useState(true);
  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}` | null>(null);
  const [currentDrawer, setCurrentDrawer] = useState<DrawerTypeEnum>(DrawerTypeEnum.NONE);

  // 社区模态框
  const {
    isOpen: isCommunityOpen,
    onOpen: onCommunityOpen,
    onClose: onCommunityClose
  } = useDisclosure();

  // Cookie和重定向相关
  const cookieVersion = '1';
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');
  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

  // 如果用户已登录，直接返回
  const isUserLoggedIn = useMemo(() => userInfo !== null, [userInfo]);

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
        setCurrentDrawer(DrawerTypeEnum.REDIRECT);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  // 登录成功处理
  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setUserInfo(res.user);
      onSuccess?.(res);
    },
    [setUserInfo, onSuccess]
  );

  // 初始化逻辑
  const initLoginLogic = useCallback(async () => {
    if (!enabled || isUserLoggedIn) {
      setIsInitializing(false);
      return;
    }

    setIsInitializing(true);

    try {
      // Cookie版本检查
      if (localCookieVersion !== cookieVersion) {
        setCurrentDrawer(DrawerTypeEnum.COOKIES);
      }

      // 中国IP检测
      if (chineseRedirectUrl && showRedirect) {
        await checkIpInChina();
      }

      // 设置页面类型
      const bd_vid = getBdVId();
      if (bd_vid) {
        setPageType(LoginPageTypeEnum.passwordLogin);
      } else {
        setPageType(
          feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
        );
      }

      // 重置聊天状态
      setLastChatAppId('');
    } finally {
      setIsInitializing(false);
    }
  }, [
    enabled,
    isUserLoggedIn,
    localCookieVersion,
    cookieVersion,
    chineseRedirectUrl,
    showRedirect,
    checkIpInChina,
    feConfigs?.oauth?.wechat,
    setLastChatAppId
  ]);

  // 抽屉关闭处理
  const closeDrawer = useCallback(() => {
    setCurrentDrawer(DrawerTypeEnum.NONE);
  }, []);

  // Cookie同意处理
  const agreeCookies = useCallback(() => {
    setLocalCookieVersion(cookieVersion);
    closeDrawer();
  }, [cookieVersion, setLocalCookieVersion, closeDrawer]);

  // 重定向处理
  const handleRedirect = useCallback(() => {
    if (chineseRedirectUrl) {
      window.open(chineseRedirectUrl, '_self');
    }
  }, [chineseRedirectUrl]);

  // 禁用重定向提醒
  const disableRedirect = useCallback(() => {
    setShowRedirect(false);
    closeDrawer();
  }, [setShowRedirect, closeDrawer]);

  // 自动初始化
  useEffect(() => {
    if (autoInit) {
      initLoginLogic();
    }
  }, [autoInit, initLoginLogic]);

  // 动态组件
  const DynamicComponent = useMemo(() => {
    if (isUserLoggedIn || !pageType) return null;

    const TypeMap = {
      [LoginPageTypeEnum.passwordLogin]: LoginForm,
      [LoginPageTypeEnum.register]: RegisterForm,
      [LoginPageTypeEnum.forgetPassword]: ForgetPasswordForm,
      [LoginPageTypeEnum.wechat]: WechatForm
    };

    const Component = TypeMap[pageType];
    if (!Component) return null;

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }, [isUserLoggedIn, pageType, loginSuccess]);

  // 加载状态判断
  const isLoading = isInitializing || (!isUserLoggedIn && !pageType);

  return {
    // State
    isUserLoggedIn,
    isLoading,
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

    // Drawer Management
    currentDrawer,
    closeDrawer,
    agreeCookies,
    handleRedirect,
    disableRedirect,

    isOpenCookiesDrawer: currentDrawer === DrawerTypeEnum.COOKIES,
    isOpenRedirect: currentDrawer === DrawerTypeEnum.REDIRECT
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
  autoInit = true,
  enabled = true,
  children
}: {
  onSuccess?: (res: ResLogin) => void;
  chineseRedirectUrl?: string;
  autoInit?: boolean;
  enabled?: boolean;
  children?: React.ReactNode;
}) => {
  const loginLogic = useLoginLogic({
    onSuccess,
    chineseRedirectUrl,
    autoInit,
    enabled
  });

  const {
    isLoading,
    feConfigs,
    DynamicComponent,
    isCommunityOpen,
    onCommunityOpen,
    onCommunityClose,
    currentDrawer,
    closeDrawer,
    agreeCookies,
    handleRedirect,
    disableRedirect
  } = loginLogic;

  return (
    <>
      {/* Google reCAPTCHA Script */}
      {feConfigs.googleClientVerKey && (
        <Script
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${feConfigs.googleClientVerKey}`}
        />
      )}

      {/* 主内容区域 */}
      <Box w={['100%', '380px']} flex={'1 0 0'}>
        {isLoading ? (
          <Center w={'full'} h={'full'} position={'relative'}>
            <Loading fixed={false} />
          </Center>
        ) : (
          DynamicComponent
        )}
      </Box>

      {/* 无法登录帮助链接 */}
      {feConfigs?.concatMd && !isLoading && (
        <Box
          mt={8}
          color={'primary.700'}
          fontSize={'mini'}
          fontWeight={'medium'}
          cursor={'pointer'}
          textAlign={'center'}
          onClick={onCommunityOpen}
        >
          {loginLogic.t('common:support.user.login.can_not_login')}
        </Box>
      )}

      {/* 自定义内容 */}
      {children}

      {/* 社区模态框 */}
      {isCommunityOpen && <CommunityModal onClose={onCommunityClose} />}

      {/* 统一的抽屉管理 */}
      {currentDrawer === DrawerTypeEnum.REDIRECT && (
        <RedirectDrawer
          isOpen={true}
          onClose={closeDrawer}
          onRedirect={handleRedirect}
          disableDrawer={disableRedirect}
        />
      )}

      {currentDrawer === DrawerTypeEnum.COOKIES && (
        <CookiesDrawer onAgree={agreeCookies} onClose={closeDrawer} />
      )}
    </>
  );
};

export default LoginContainer;
