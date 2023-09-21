import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useGlobalStore } from '@/store/global';
import { ResLogin } from '@/api/response/user';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { setToken } from '@/utils/user';
import { oauthLogin } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import Loading from '@/components/Loading';
import { serviceSideProps } from '@/utils/web/i18n';
import { useQuery } from '@tanstack/react-query';
import { getErrText } from '@/utils/tools';

const provider = ({ code, state }: { code: string; state: string }) => {
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

  const authCode = useCallback(
    async (code: string) => {
      if (!loginStore) {
        router.replace('/login');
        return;
      }
      try {
        const res = await oauthLogin({
          type: loginStore?.provider,
          code,
          callbackUrl: `${location.origin}/login/provider`,
          inviterId: localStorage.getItem('inviterId') || undefined
        });
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
    },
    [loginStore, loginSuccess, router, toast]
  );

  useQuery(['init', code], () => {
    if (!code) return;
    if (state !== loginStore?.state) {
      toast({
        status: 'warning',
        title: '安全校验失败'
      });
      setTimeout(() => {
        router.replace('/login');
      }, 1000);
      return;
    }
    authCode(code);
    return null;
  });

  useEffect(() => {
    router.prefetch('/app/list');
  }, []);

  return <Loading />;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      code: content?.query?.code,
      state: content?.query?.state,
      ...(await serviceSideProps(content))
    }
  };
}

export default provider;
