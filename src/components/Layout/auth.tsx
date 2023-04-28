import React from 'react';
import { useRouter } from 'next/router';
import { useToast } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';

const unAuthPage: { [key: string]: boolean } = {
  '/': true,
  '/login': true,
  '/model/share': true
};

const Auth = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const toast = useToast({
    title: '请先登录',
    position: 'top',
    status: 'warning'
  });
  const { userInfo, initUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();

  useQuery(
    [router.pathname, userInfo],
    () => {
      if (unAuthPage[router.pathname] === true || userInfo) {
        return setLoading(false);
      } else {
        setLoading(true);
        return initUserInfo();
      }
    },
    {
      onError(error) {
        console.log('error->', error);
        router.replace('/login');
        toast();
      },
      onSettled() {
        setLoading(false);
      }
    }
  );

  return userInfo || unAuthPage[router.pathname] === true ? children : null;
};

export default Auth;
