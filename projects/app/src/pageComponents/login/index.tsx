import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Flex,
  Button
} from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LoginSuccessResponse } from '@/global/support/api/userRes.d';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useLocalStorageState } from 'ahooks';
import { useTranslation } from 'next-i18next';
import LoginForm from '@/pageComponents/login/LoginForm/LoginForm';
import { GET } from '@/web/common/api/request';
import { getDocPath } from '@/web/common/system/doc';

const RegisterForm = dynamic(() => import('@/pageComponents/login/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('@/pageComponents/login/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('@/pageComponents/login/LoginForm/WechatForm'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ipDetectURL = 'https://qifu-api.baidubce.com/ip/local/geo/v1/district';

// Cookies Modal Component
const CookiesModal = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const cookieVersion = '1';
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');

  useEffect(() => {
    // Check if user has agreed to current cookie version
    if (localCookieVersion !== cookieVersion) {
      setIsOpen(true);
    }
  }, [localCookieVersion, cookieVersion]);

  const handleAgree = () => {
    setLocalCookieVersion(cookieVersion);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  // Don't render if not needed
  if (!isOpen) {
    return null;
  }

  return (
    <Drawer placement="bottom" size={'xs'} isOpen={isOpen} onClose={handleClose}>
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
              onClick={() => window.open(getDocPath('/docs/protocol/privacy/'), '_blank')}
            >
              {t('login:privacy_policy')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={handleAgree}>
            {t('login:agree')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

// Chinese Redirect Modal Component
const ChineseRedirectModal = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const chineseRedirectUrl = feConfigs?.chineseRedirectUrl;

  const [isOpen, setIsOpen] = useState(false);

  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

  // IP detection without cache
  const checkIpInChina = useCallback(async () => {
    try {
      const res = await GET<any>(ipDetectURL);
      const country = res?.country;
      const isChina =
        country === '中国' &&
        res.prov !== '中国香港' &&
        res.prov !== '中国澳门' &&
        res.prov !== '中国台湾';

      if (isChina) {
        setIsOpen(true);
      }
    } catch (error) {
      console.log('IP detection failed:', error);
    }
  }, []);

  useEffect(() => {
    // Only check IP if redirect URL is provided and user hasn't disabled it
    if (chineseRedirectUrl && showRedirect) {
      checkIpInChina();
    }
  }, [chineseRedirectUrl, showRedirect, checkIpInChina]);

  const handleRedirect = () => {
    if (chineseRedirectUrl) {
      window.open(chineseRedirectUrl, '_self');
    }
  };

  const handleNoRemind = () => {
    setShowRedirect(false);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  // Don't render if no redirect URL provided or not open
  if (!chineseRedirectUrl || !isOpen) {
    return null;
  }

  return (
    <Drawer placement="bottom" size={'xs'} isOpen={isOpen} onClose={handleClose}>
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
              w={'fit-content'}
              onClick={handleNoRemind}
            >
              {t('login:no_remind')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={handleRedirect}>
            {t('login:redirect')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

// login container component
export const LoginContainer = ({
  children,
  onSuccess
}: {
  children?: React.ReactNode;
  onSuccess: (res: LoginSuccessResponse) => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { setLastChatAppId } = useChatStore();

  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}`>(LoginPageTypeEnum.passwordLogin);
  const [showCommunityModal, setShowCommunityModal] = useState(false);

  // login success handler
  const loginSuccess = useCallback(
    (res: LoginSuccessResponse) => {
      onSuccess?.(res);
    },
    [onSuccess]
  );

  // initialization logic
  useEffect(() => {
    // reset chat state
    setLastChatAppId('');
  }, [feConfigs?.oauth?.wechat, setLastChatAppId]);

  // dynamic component based on page type
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
        <Box w={['100%', '380px']} flex={['', '1 0 0']}>
          {pageType && DynamicComponent ? DynamicComponent : <Loading fixed={false} />}
        </Box>

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

      <CookiesModal />
      <ChineseRedirectModal />

      {/* Community modal */}
      {showCommunityModal && <CommunityModal onClose={() => setShowCommunityModal(false)} />}
    </>
  );
};

export default LoginContainer;
