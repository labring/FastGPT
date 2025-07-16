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
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
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
  autoInit?: boolean;
  enabled?: boolean;
}) => {
  const { onSuccess, chineseRedirectUrl, autoInit = true, enabled = true } = options;
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const { setLastChatAppId } = useChatStore();
  const { isPc } = useSystem();

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

  // 自动初始化
  useEffect(() => {
    if (autoInit && enabled) {
      initLoginLogic();
    }
  }, [autoInit, enabled, initLoginLogic]);

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
    isPc,
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

// 登录容器组件
export const LoginContainer = ({
  children,
  showLanguageSelector = true,
  languageSelectorPosition = 'top-right',
  onSuccess,
  chineseRedirectUrl,
  autoInit = true,
  enabled = true
}: {
  children?: React.ReactNode;
  showLanguageSelector?: boolean;
  languageSelectorPosition?: 'top-right' | 'absolute-top-right';
  onSuccess?: (res: ResLogin) => void;
  chineseRedirectUrl?: string;
  autoInit?: boolean;
  enabled?: boolean;
}) => {
  const loginLogic = useLoginLogic({
    onSuccess,
    chineseRedirectUrl,
    autoInit,
    enabled
  });

  const {
    pageType,
    isPc,
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
        {/* 语言选择器 */}
        {showLanguageSelector && isPc && (
          <Box
            position={languageSelectorPosition === 'absolute-top-right' ? 'absolute' : 'relative'}
            top={languageSelectorPosition === 'absolute-top-right' ? '24px' : undefined}
            right={languageSelectorPosition === 'absolute-top-right' ? '24px' : undefined}
            zIndex={10}
          >
            <I18nLngSelector />
          </Box>
        )}

        {/* 主内容区域 */}
        <Box w={['100%', '380px']} flex={'1 0 0'}>
          {pageType && DynamicComponent ? (
            DynamicComponent
          ) : (
            <Center w={'full'} h={'full'} position={'relative'}>
              <Loading fixed={false} />
            </Center>
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
            {loginLogic.t('common:support.user.login.can_not_login')}
          </Box>
        )}

        {/* 自定义内容 */}
        {children}
      </Box>

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
