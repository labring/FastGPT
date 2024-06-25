import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useChatStore } from '@/web/core/chat/context/storeChat';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken, setToken } from '@/web/support/user/auth';
import { oauthLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { useMount } from 'ahooks';

const provider = ({ code, state, error }: { code: string; state: string; error?: string }) => {
  const { t } = useTranslation();
  const { loginStore } = useSystemStore();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setToken(res.token);
      setUserInfo(res.user);

      // init store
      setLastChatId('');
      setLastChatAppId('');

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

  useMount(() => {
    clearToken();
    router.prefetch('/app/list');
    if (error) {
      toast({
        status: 'warning',
        title: t('support.user.login.Provider error')
      });
      router.replace('/login');
      return;
    }
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
  });

  return <Loading />;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      code: content?.query?.code || '',
      state: content?.query?.state || '',
      error: content?.query?.error || '',
      ...(await serviceSideProps(content))
    }
  };
}

export default provider;
