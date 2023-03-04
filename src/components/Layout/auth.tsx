import React from 'react';
import { useRouter } from 'next/router';
import { useToast } from '@chakra-ui/react';
import { getTokenLogin } from '@/api/user';
import { useUserStore } from '@/store/user';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';

const unAuthPage: { [key: string]: boolean } = {
  '/': true,
  '/login': true,
  '/chat': true
};

const Auth = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const toast = useToast({
    title: '请先登录',
    position: 'top',
    status: 'warning'
  });
  const { userInfo, setUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();

  useQuery(
    [router.pathname, userInfo],
    () => {
      setLoading(true);
      if (unAuthPage[router.pathname] === true || userInfo) {
        return setLoading(false);
      } else {
        return getTokenLogin();
      }
    },
    {
      onSuccess(user) {
        if (user) {
          setUserInfo(user);
        }
      },
      onError(error) {
        console.log(error);
        router.push('/login');
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
