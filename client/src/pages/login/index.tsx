import React, { useState, useCallback, useEffect } from 'react';
import styles from './index.module.scss';
import { Box, Flex, Image, useDisclosure } from '@chakra-ui/react';
import { PageTypeEnum } from '@/constants/user';
import { useGlobalStore } from '@/store/global';
import type { ResLogin } from '@/api/response/user';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import LoginForm from './components/LoginForm';
import dynamic from 'next/dynamic';
import { serviceSideProps } from '@/utils/web/i18n';
import { setToken } from '@/utils/user';
import { feConfigs } from '@/store/static';
import CommunityModal from '@/components/CommunityModal';
import Script from 'next/script';
const RegisterForm = dynamic(() => import('./components/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('./components/ForgetPasswordForm'));

const Login = () => {
  const router = useRouter();
  const { lastRoute = '' } = router.query as { lastRoute: string };
  const { isPc } = useGlobalStore();
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
        className={styles.loginPage}
        h={'100%'}
        px={[0, '10vw']}
      >
        <Flex
          height="100%"
          w={'100%'}
          maxW={'1240px'}
          maxH={['auto', 'max(660px,80vh)']}
          backgroundColor={'#fff'}
          alignItems={'center'}
          justifyContent={'center'}
          py={[5, 10]}
          px={'5vw'}
          borderRadius={isPc ? 'md' : 'none'}
          gap={5}
        >
          {isPc && (
            <Image
              src={'/icon/loginLeft.svg'}
              order={pageType === PageTypeEnum.login ? 0 : 2}
              flex={'1 0 0'}
              w="0"
              maxW={'600px'}
              height={'100%'}
              maxH={'450px'}
              alt=""
              loading={'lazy'}
            />
          )}

          <Box
            position={'relative'}
            order={1}
            flex={`0 0 ${isPc ? '400px' : '100%'}`}
            height={'100%'}
            border="1px"
            borderColor="gray.200"
            py={5}
            px={10}
            borderRadius={isPc ? 'md' : 'none'}
          >
            <DynamicComponent type={pageType} />

            {feConfigs?.show_contact && (
              <Box
                fontSize={'sm'}
                color={'myGray.600'}
                cursor={'pointer'}
                position={'absolute'}
                right={5}
                bottom={3}
                onClick={onOpen}
              >
                无法登录，点击联系
              </Box>
            )}
          </Box>
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
