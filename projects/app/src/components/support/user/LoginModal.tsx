import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  Box,
  Flex,
  useDisclosure,
  Center,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { getBdVId } from '@/web/support/marketing/utils';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import Script from 'next/script';
import { useLocalStorageState } from 'ahooks';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { GET } from '@/web/common/api/request';
import { getDocPath } from '@/web/common/system/doc';

const LoginForm = dynamic(() => import('@/pageComponents/login/LoginForm/LoginForm'));
const RegisterForm = dynamic(() => import('@/pageComponents/login/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('@/pageComponents/login/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('@/pageComponents/login/LoginForm/WechatForm'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ipDetectURL = 'https://qifu-api.baidubce.com/ip/local/geo/v1/district';

interface LoginModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  ChineseRedirectUrl?: string;
}

const LoginModal = ({ isOpen, onSuccess, ChineseRedirectUrl }: LoginModalProps) => {
  const { t } = useTranslation();
  const { setUserInfo } = useUserStore();
  const { setLastChatAppId } = useChatStore();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}` | null>(null);

  const {
    isOpen: isCommunityOpen,
    onOpen: onCommunityOpen,
    onClose: onCommunityClose
  } = useDisclosure();

  const {
    isOpen: isOpenCookiesDrawer,
    onOpen: onOpenCookiesDrawer,
    onClose: onCloseCookiesDrawer
  } = useDisclosure();
  const cookieVersion = '1';
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');

  const {
    isOpen: isOpenRedirect,
    onOpen: onOpenRedirect,
    onClose: onCloseRedirect
  } = useDisclosure();
  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

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

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setUserInfo(res.user);
      onSuccess?.();
    },
    [setUserInfo, onSuccess]
  );

  useEffect(() => {
    if (!isOpen) return;

    if (localCookieVersion !== cookieVersion) {
      onOpenCookiesDrawer();
    }

    if (ChineseRedirectUrl && showRedirect) {
      checkIpInChina();
    }

    const bd_vid = getBdVId();
    if (bd_vid) {
      setPageType(LoginPageTypeEnum.passwordLogin);
      return;
    }

    setPageType(
      feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
    );

    setLastChatAppId('');
  }, [
    feConfigs?.oauth,
    setLastChatAppId,
    isOpen,
    localCookieVersion,
    cookieVersion,
    onOpenCookiesDrawer,
    ChineseRedirectUrl,
    showRedirect,
    checkIpInChina
  ]);

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

      <Modal
        isOpen={isOpen}
        onClose={() => {}}
        closeOnOverlayClick={false}
        closeOnEsc={false}
        isCentered
        size="lg"
      >
        <ModalOverlay />
        <ModalContent
          mx={4}
          maxH="90vh"
          overflow="auto"
          w={['100%', '556px']}
          h={['100%', 'auto']}
          maxW="556px"
          borderRadius={[0, '16px']}
        >
          <ModalBody
            px={['5vw', '88px']}
            py={['5vh', '64px']}
            minH={['100vh', '600px']}
            display="flex"
            flexDirection="column"
            position="relative"
          >
            {/* Language selector - positioned in top right */}
            {isPc && (
              <Box position={'absolute'} top={'24px'} right={'24px'}>
                <I18nLngSelector />
              </Box>
            )}

            <Box w={['100%', '380px']} flex={'1 0 0'}>
              {pageType && DynamicComponent ? (
                DynamicComponent
              ) : (
                <Center w={'full'} h={'full'} position={'relative'}>
                  <Loading fixed={false} />
                </Center>
              )}
            </Box>

            {/* Community help link */}
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
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Community Modal */}
      {isCommunityOpen && <CommunityModal onClose={onCommunityClose} />}

      {/* Chinese IP Redirect Drawer */}
      {showRedirect && ChineseRedirectUrl && (
        <RedirectDrawer
          isOpen={isOpenRedirect}
          onClose={onCloseRedirect}
          onRedirect={() => window.open(ChineseRedirectUrl, '_self')}
          disableDrawer={() => setShowRedirect(false)}
        />
      )}

      {/* Cookies Agreement Drawer */}
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

// Redirect Drawer Component
function RedirectDrawer({
  isOpen,
  onClose,
  disableDrawer,
  onRedirect
}: {
  isOpen: boolean;
  onClose: () => void;
  disableDrawer: () => void;
  onRedirect: () => void;
}) {
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
}

// Cookies Drawer Component
function CookiesDrawer({ onClose, onAgree }: { onClose: () => void; onAgree: () => void }) {
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
}

export default LoginModal;
