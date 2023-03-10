import React, { useState, useCallback, useEffect } from 'react';
import styles from './index.module.scss';
import { Box, Flex, Image } from '@chakra-ui/react';
import { PageTypeEnum } from '@/constants/user';
import { useScreen } from '@/hooks/useScreen';
import type { ResLogin } from '@/api/response/user';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';

import dynamic from 'next/dynamic';
const LoginForm = dynamic(() => import('./components/LoginForm'));
const RegisterForm = dynamic(() => import('./components/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('./components/ForgetPasswordForm'));

const Login = () => {
  const router = useRouter();
  const { isPc } = useScreen();
  const [pageType, setPageType] = useState<`${PageTypeEnum}`>(PageTypeEnum.login);
  const { setUserInfo } = useUserStore();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setUserInfo(res.user, res.token);
      router.push('/model/list');
    },
    [router, setUserInfo]
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
    router.prefetch('/model/list');
  }, [router]);

  return (
    <Box className={styles.loginPage} h={'100%'} p={isPc ? '10vh 10vw' : 0}>
      <Flex
        maxW={'1240px'}
        m={'auto'}
        backgroundColor={'#fff'}
        height="100%"
        alignItems={'center'}
        justifyContent={'center'}
        p={10}
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
          maxH={'450px'}
          border="1px"
          borderColor="gray.200"
          py={5}
          px={10}
          borderRadius={isPc ? 'md' : 'none'}
        >
          <DynamicComponent type={pageType} />
        </Box>
      </Flex>
    </Box>
  );
};

export default Login;
