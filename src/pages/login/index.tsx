import React, { useState, useCallback, useEffect } from 'react';
import styles from './index.module.scss';
import { Box, Flex, Image } from '@chakra-ui/react';
import { PageTypeEnum } from '@/constants/user';
import { useGlobalStore } from '@/store/global';
import type { ResLogin } from '@/api/response/user';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import LoginForm from './components/LoginForm';
import dynamic from 'next/dynamic';
const RegisterForm = dynamic(() => import('./components/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('./components/ForgetPasswordForm'));

const Login = () => {
  const router = useRouter();
  const { lastRoute = '' } = router.query as { lastRoute: string };
  const { isPc } = useGlobalStore();
  const [pageType, setPageType] = useState<`${PageTypeEnum}`>(PageTypeEnum.login);
  const { setUserInfo, setLastModelId, loadMyModels } = useUserStore();
  const { setLastChatId, setLastChatModelId, loadHistory } = useChatStore();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      // init store
      setLastChatId('');
      setLastModelId('');
      setLastChatModelId('');
      loadMyModels(true);
      loadHistory({ pageNum: 1, init: true });

      setUserInfo(res.user);
      setTimeout(() => {
        router.push(lastRoute ? decodeURIComponent(lastRoute) : '/model');
      }, 100);
    },
    [
      lastRoute,
      loadHistory,
      loadMyModels,
      router,
      setLastChatId,
      setLastChatModelId,
      setLastModelId,
      setUserInfo
    ]
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
    router.prefetch('/model');
  }, [router]);

  return (
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
          />
        )}

        <Box
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
        </Box>
      </Flex>
    </Flex>
  );
};

export default Login;
