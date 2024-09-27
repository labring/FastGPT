import React, { useState, useCallback, useEffect } from 'react';
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
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/storeChat';
import LoginForm from './components/LoginForm/LoginForm';
import dynamic from 'next/dynamic';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { clearToken, setToken } from '@/web/support/user/auth';
import Script from 'next/script';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useLocalStorageState, useMount } from 'ahooks';
import { useTranslation } from 'next-i18next';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const RegisterForm = dynamic(() => import('./components/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('./components/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('./components/LoginForm/WechatForm'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const Login = ({ ChineseIp }: { ChineseIp: string }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { lastRoute = '' } = router.query as { lastRoute: string };
  const { feConfigs } = useSystemStore();
  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}`>();
  const { setUserInfo } = useUserStore();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isPc } = useSystem();
  const {
    isOpen: isOpenRedirect,
    onOpen: onOpenRedirect,
    onClose: onCloseRedirect
  } = useDisclosure();

  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      // init store
      setLastChatId('');
      setLastChatAppId('');

      setUserInfo(res.user);
      setToken(res.token);
      setTimeout(() => {
        router.push(lastRoute ? decodeURIComponent(lastRoute) : '/app/list');
      }, 300);
    },
    [lastRoute, router, setLastChatId, setLastChatAppId, setUserInfo]
  );

  function DynamicComponent({ type }: { type: `${LoginPageTypeEnum}` }) {
    const TypeMap = {
      [LoginPageTypeEnum.passwordLogin]: LoginForm,
      [LoginPageTypeEnum.register]: RegisterForm,
      [LoginPageTypeEnum.forgetPassword]: ForgetPasswordForm,
      [LoginPageTypeEnum.wechat]: WechatForm
    };

    const Component = TypeMap[type];

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }

  /* default login type */
  useEffect(() => {
    setPageType(
      feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
    );
  }, [feConfigs.oauth]);

  useMount(() => {
    clearToken();
    router.prefetch('/app/list');
  });

  const checkIpInChina = useCallback(() => {
    const onSuccess = function (res: any) {
      if (!res.country.iso_code) {
        return;
      }

      const country = res.country.iso_code.toLowerCase();
      if (country === 'cn' || country === 'hk') {
        onOpenRedirect();
      }
    };
    const onError = (e: any) => console.log(e);
    geoip2 && geoip2.country(onSuccess, onError);
  }, [onOpenRedirect]);

  return (
    <>
      {feConfigs.googleClientVerKey && (
        <Script
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${feConfigs.googleClientVerKey}`}
        ></Script>
      )}

      {ChineseIp && showRedirect && (
        <Script
          src="//geoip-js.com/js/apis/geoip2/v2.1/geoip2.js"
          type="text/javascript"
          onLoad={checkIpInChina}
        ></Script>
      )}

      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        bg={`url('/icon/login-bg.svg') no-repeat`}
        backgroundSize={'cover'}
        userSelect={'none'}
        h={'100%'}
        px={[0, '10vw']}
      >
        {isPc && (
          <Box position={'absolute'} top={'24px'} right={'50px'}>
            <I18nLngSelector />
          </Box>
        )}
        <Flex
          flexDirection={'column'}
          w={['100%', 'auto']}
          h={['100%', '700px']}
          maxH={['100%', '90vh']}
          bg={'white'}
          px={['5vw', '88px']}
          py={'5vh'}
          borderRadius={[0, '24px']}
          boxShadow={[
            '',
            '0px 0px 1px 0px rgba(19, 51, 107, 0.20), 0px 32px 64px -12px rgba(19, 51, 107, 0.20)'
          ]}
        >
          <Box w={['100%', '380px']} flex={'1 0 0'}>
            {pageType ? (
              <DynamicComponent type={pageType} />
            ) : (
              <Center w={'full'} h={'full'} position={'relative'}>
                <Loading fixed={false} />
              </Center>
            )}
          </Box>
          {feConfigs?.concatMd && (
            <Box
              mt={8}
              color={'primary.700'}
              cursor={'pointer'}
              textAlign={'center'}
              onClick={onOpen}
            >
              {t('common:support.user.login.can_not_login')}
            </Box>
          )}
        </Flex>

        {isOpen && <CommunityModal onClose={onClose} />}
      </Flex>
      {showRedirect && (
        <Drawer placement="bottom" size={'xs'} isOpen={isOpenRedirect} onClose={onCloseRedirect}>
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
                  onClick={() => setShowRedirect(false)}
                >
                  {t('login:no_remind')}
                </Box>
              </Box>
              <Button ml={'0.75rem'} onClick={() => router.push(ChineseIp)}>
                {t('login:redirect')}
              </Button>
            </Flex>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      ChineseIp: process.env.CHINESE_IP_REDIRECT,
      ...(await serviceSideProps(context, ['app', 'user', 'login']))
    }
  };
}

export default Login;
