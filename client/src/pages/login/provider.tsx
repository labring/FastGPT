import React, { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useGlobalStore } from '@/store/global';
import { ResLogin } from '@/api/response/user';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { setToken } from '@/utils/user';
import { gitLogin } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import Loading from '@/components/Loading';
import { serviceSideProps } from '@/utils/i18n';
import { useQuery } from '@tanstack/react-query';
import { getErrText } from '@/utils/tools';

const provider = ({ code }: { code: string }) => {
  const { loginStore } = useGlobalStore();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      // init store
      setLastChatId('');
      setLastChatAppId('');

      setUserInfo(res.user);
      setToken(res.token);
      setTimeout(() => {
        router.push(
          loginStore?.lastRoute ? decodeURIComponent(loginStore?.lastRoute) : '/app/list'
        );
      }, 100);
    },
    [setLastChatId, setLastChatAppId, setUserInfo, router, loginStore?.lastRoute]
  );

  const authCode = useCallback(async () => {
    if (!code) return;
    if (!loginStore) {
      router.replace('/login');
      return;
    }
    try {
      const res = await (async () => {
        if (loginStore.provider === 'git') {
          return gitLogin({
            code,
            inviterId: localStorage.getItem('inviterId') || undefined
          });
        }
        return null;
      })();
      if (!res) {
        toast({
          status: 'warning',
          title: '登录异常'
        });
        return setTimeout(() => {
          router.replace('/login');
        }, 1000);
      }
      loginSuccess(res);
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, '登录异常')
      });
      setTimeout(() => {
        router.replace('/login');
      }, 1000);
    }
  }, [code, loginStore, loginSuccess]);

  useQuery(['init', code], () => {
    authCode();
    return null;
  });

  return <Loading />;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      code: content?.query?.code,
      ...(await serviceSideProps(content))
    }
  };
}

export default provider;
