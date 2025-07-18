import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Center,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex
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

// modal type enum
enum ModalType {
  NONE = 'none',
  COOKIES = 'cookies',
  REDIRECT = 'redirect',
  COMMUNITY = 'community'
}

// IP detection cache
let ipDetectionCache: { isChina: boolean; timestamp: number } | null = null;
const IP_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// common drawer component
const CommonDrawer = ({
  type,
  isOpen,
  onClose,
  onConfirm,
  onSecondaryAction,
  secondaryActionText,
  confirmText,
  title,
  description
}: {
  type: ModalType;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSecondaryAction?: () => void;
  secondaryActionText?: string;
  confirmText: string;
  title: string;
  description?: string;
}) => {
  const { t } = useTranslation();

  if (type === ModalType.NONE) return null;

  return (
    <Drawer placement="bottom" size={'xs'} isOpen={isOpen} onClose={onClose}>
      <DrawerOverlay backgroundColor={'rgba(0,0,0,0.2)'} />
      <DrawerContent py={'1.75rem'} px={'3rem'}>
        <DrawerCloseButton size={'sm'} />
        <Flex align={'center'} justify={'space-between'}>
          <Box>
            <Box color={'myGray.900'} fontWeight={'500'} fontSize={'1rem'}>
              {title}
            </Box>
            {secondaryActionText && onSecondaryAction && (
              <Box
                color={'primary.700'}
                fontWeight={'500'}
                fontSize={'1rem'}
                textDecorationLine={'underline'}
                cursor={'pointer'}
                w={'fit-content'}
                onClick={onSecondaryAction}
              >
                {secondaryActionText}
              </Box>
            )}
            {description && (
              <Box
                color={'primary.700'}
                fontWeight={'500'}
                fontSize={'1rem'}
                textDecorationLine={'underline'}
                cursor={'pointer'}
                w={'fit-content'}
                onClick={() => window.open(getDocPath('/docs/agreement/privacy/'), '_blank')}
              >
                {description}
              </Box>
            )}
          </Box>
          <Button ml={'0.75rem'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

// hook for login logic
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
  const [activeModal, setActiveModal] = useState<ModalType>(ModalType.NONE);

  // localStorage state
  const cookieVersion = '1';
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');
  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

  // unified modal control
  const openModal = useCallback((type: ModalType) => setActiveModal(type), []);
  const closeModal = useCallback(() => setActiveModal(ModalType.NONE), []);

  // optimized IP detection, add cache mechanism
  const checkIpInChina = useCallback(async () => {
    try {
      // check cache
      const now = Date.now();
      if (ipDetectionCache && now - ipDetectionCache.timestamp < IP_CACHE_DURATION) {
        if (ipDetectionCache.isChina) {
          openModal(ModalType.REDIRECT);
        }
        return;
      }

      const res = await GET<any>(ipDetectURL);
      const country = res?.country;
      const isChina =
        country === '中国' &&
        res.prov !== '中国香港' &&
        res.prov !== '中国澳门' &&
        res.prov !== '中国台湾';

      // update cache
      ipDetectionCache = { isChina, timestamp: now };

      if (isChina) {
        openModal(ModalType.REDIRECT);
      }
    } catch (error) {
      console.log('IP detection failed:', error);
    }
  }, [openModal]);

  // login success handler
  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setUserInfo(res.user);
      onSuccess?.(res);
    },
    [setUserInfo, onSuccess]
  );

  // unified initialization logic
  const initLoginLogic = useCallback(() => {
    // Cookie version check
    if (localCookieVersion !== cookieVersion) {
      openModal(ModalType.COOKIES);
    }

    // China IP detection
    if (chineseRedirectUrl && showRedirect) {
      checkIpInChina();
    }

    // set page type
    const bd_vid = getBdVId();
    if (bd_vid) {
      setPageType(LoginPageTypeEnum.passwordLogin);
      return;
    }

    setPageType(
      feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
    );

    // reset chat state
    setLastChatAppId('');
  }, [
    localCookieVersion,
    cookieVersion,
    openModal,
    chineseRedirectUrl,
    showRedirect,
    checkIpInChina,
    feConfigs?.oauth?.wechat,
    setLastChatAppId
  ]);

  // auto initialization
  useEffect(() => {
    if (autoInit && enabled) {
      initLoginLogic();
    }
  }, [autoInit, enabled, initLoginLogic]);

  // dynamic component
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

  // modal config
  const modalConfig = useMemo(() => {
    switch (activeModal) {
      case ModalType.COOKIES:
        return {
          title: t('login:cookies_tip'),
          confirmText: t('login:agree'),
          description: t('login:privacy_policy'),
          onConfirm: () => {
            setLocalCookieVersion(cookieVersion);
            closeModal();
          }
        };
      case ModalType.REDIRECT:
        return {
          title: t('login:Chinese_ip_tip'),
          confirmText: t('login:redirect'),
          secondaryActionText: t('login:no_remind'),
          onConfirm: () => window.open(chineseRedirectUrl, '_self'),
          onSecondaryAction: () => setShowRedirect(false)
        };
      default:
        return null;
    }
  }, [
    activeModal,
    t,
    setLocalCookieVersion,
    cookieVersion,
    closeModal,
    chineseRedirectUrl,
    setShowRedirect
  ]);

  return {
    // basic state
    pageType,
    setPageType,
    isPc,
    feConfigs,
    t,

    // core functions
    loginSuccess,
    initLoginLogic,
    DynamicComponent,

    // modal management
    activeModal,
    modalConfig,
    openModal,
    closeModal,
    chineseRedirectUrl
  };
};

// login container component
export const LoginContainer = ({
  children,
  onSuccess,
  chineseRedirectUrl,
  autoInit = true,
  enabled = true
}: {
  children?: React.ReactNode;
  onSuccess?: (res: ResLogin) => void;
  chineseRedirectUrl?: string;
  autoInit?: boolean;
  enabled?: boolean;
}) => {
  const {
    pageType,
    feConfigs,
    DynamicComponent,
    activeModal,
    modalConfig,
    openModal,
    closeModal,
    t
  } = useLoginLogic({
    onSuccess,
    chineseRedirectUrl,
    autoInit,
    enabled
  });

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
        <Box w={['100%', '380px']} flex={'1 0 0'}>
          {pageType && DynamicComponent ? (
            DynamicComponent
          ) : (
            <Center w={'full'} h={'full'} position={'relative'}>
              <Loading fixed={false} />
            </Center>
          )}
        </Box>

        {/* help link for login */}
        {feConfigs?.concatMd && (
          <Box
            mt={8}
            color={'primary.700'}
            fontSize={'mini'}
            fontWeight={'medium'}
            cursor={'pointer'}
            textAlign={'center'}
            onClick={() => openModal(ModalType.COMMUNITY)}
          >
            {t('common:support.user.login.can_not_login')}
          </Box>
        )}

        {/* custom content */}
        {children}
      </Box>

      {/* community modal */}
      {activeModal === ModalType.COMMUNITY && <CommunityModal onClose={closeModal} />}

      {/* common drawer component */}
      {modalConfig && (
        <CommonDrawer
          type={activeModal}
          isOpen={activeModal !== ModalType.NONE && activeModal !== ModalType.COMMUNITY}
          onClose={closeModal}
          {...modalConfig}
        />
      )}
    </>
  );
};

export default LoginContainer;
