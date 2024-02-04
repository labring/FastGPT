import React, { useState, useCallback, useEffect } from 'react';
import { Box, Flex, Image, useDisclosure } from '@chakra-ui/react';
import { PageTypeEnum } from '@/constants/user';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/storeChat';
import LoginForm from './components/LoginForm';
import dynamic from 'next/dynamic';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { clearToken, setToken } from '@/web/support/user/auth';
import { feConfigs } from '@/web/common/system/staticData';
import CommunityModal from '@/components/CommunityModal';
import Script from 'next/script';
const RegisterForm = dynamic(() => import('./components/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('./components/ForgetPasswordForm'));

const Login = () => {
  const router = useRouter();
  const { lastRoute = '' } = router.query as { lastRoute: string };
  const { isPc } = useSystemStore();
  const [pageType, setPageType] = useState<`${PageTypeEnum}`>(PageTypeEnum.login);
  const { setUserInfo } = useUserStore();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const { isOpen, onOpen, onClose } = useDisclosure();

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

  function DynamicComponent({ type }: { type: `${PageTypeEnum}` }) {
    const TypeMap = {
      [PageTypeEnum.login]: LoginForm,
      [PageTypeEnum.register]: RegisterForm,
      [PageTypeEnum.forgetPassword]: ForgetPasswordForm
    };

    const Component = TypeMap[type];

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }

  useEffect(() => {
    clearToken();
    router.prefetch('/app/list');
  }, []);

  return (
    <>
      {feConfigs.googleClientVerKey && (
        <Script
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${feConfigs.googleClientVerKey}`}
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
        <Flex
          flexDirection={'column'}
          w={['100%', 'auto']}
          h={['100%', '700px']}
          maxH={'90vh'}
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
            <DynamicComponent type={pageType} />
          </Box>
          {feConfigs?.concatMd && (
            <Box
              mt={8}
              color={'primary.700'}
              cursor={'pointer'}
              textAlign={'center'}
              onClick={onOpen}
            >
              无法登录，点击联系
            </Box>
          )}
        </Flex>

        {isOpen && <CommunityModal onClose={onClose} />}
      </Flex>
    </>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}

export default Login;
