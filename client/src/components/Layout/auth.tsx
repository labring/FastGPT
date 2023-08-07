import React from 'react';
import { useRouter } from 'next/router';
import { useToast } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useQuery } from '@tanstack/react-query';

const unAuthPage: { [key: string]: boolean } = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/appStore': true,
  '/chat/share': true
};

const Auth = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const toast = useToast({
    title: '请先登录',
    position: 'top',
    status: 'warning'
  });
  const { userInfo, initUserInfo } = useUserStore();

  useQuery(
    [router.pathname],
    () => {
      if (unAuthPage[router.pathname] === true || userInfo) {
        return null;
      } else {
        return initUserInfo();
      }
    },
    {
      onError(error) {
        console.log('error->', error);
        router.replace(
          `/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`
        );
        toast();
      }
    }
  );

  return userInfo || unAuthPage[router.pathname] === true ? children : null;
};

export default Auth;
