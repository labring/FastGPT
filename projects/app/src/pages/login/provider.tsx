import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken, setToken } from '@/web/support/user/auth';
import { oauthLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';

let isOauthLogging = false;

const provider = () => {
  const { t } = useTranslation();
  const { loginStore } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { code, state, error } = router.query as { code: string; state: string; error?: string };
  const { toast } = useToast();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setToken(res.token);
      setUserInfo(res.user);

      router.push(loginStore?.lastRoute ? decodeURIComponent(loginStore?.lastRoute) : '/app/list');
    },
    [setUserInfo, router, loginStore?.lastRoute]
  );

  const authCode = useCallback(
    async (code: string) => {
      if (!loginStore) {
        router.replace('/login');
        return;
      }
      try {
        const res = await oauthLogin({
          type: loginStore?.provider as `${OAuthEnum}`,
          code,
          callbackUrl: `${location.origin}/login/provider`,
          inviterId: localStorage.getItem('inviterId') || undefined
        });

        if (!res) {
          toast({
            status: 'warning',
            title: t('common:support.user.login.error')
          });
          return setTimeout(() => {
            router.replace('/login');
          }, 1000);
        }
        loginSuccess(res);
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, t('common:support.user.login.error'))
        });
        setTimeout(() => {
          router.replace('/login');
        }, 1000);
      }
    },
    [loginStore, loginSuccess, router, t, toast]
  );

  useEffect(() => {
    if (error) {
      toast({
        status: 'warning',
        title: t('common:support.user.login.Provider error')
      });
      router.replace('/login');
      return;
    }

    if (!code || !loginStore?.state || !state) return;

    if (isOauthLogging) return;

    isOauthLogging = true;

    (async () => {
      await clearToken();
      router.prefetch('/app/list');

      if (loginStore.provider !== OAuthEnum.sso && state !== loginStore?.state) {
        toast({
          status: 'warning',
          title: t('common:support.user.login.security_failed')
        });
        setTimeout(() => {
          router.replace('/login');
        }, 1000);
        return;
      } else {
        authCode(code);
      }
    })();
  }, [authCode, code, error, loginStore, loginStore?.state, router, state, t, toast]);

  return <Loading />;
};

export default provider;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
