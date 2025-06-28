import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { oauthLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import {
  getBdVId,
  getFastGPTSem,
  getInviterId,
  getSourceDomain,
  removeFastGPTSem
} from '@/web/support/marketing/utils';

let isOauthLogging = false;

const provider = () => {
  const { t } = useTranslation();
  const { initd, loginStore, setLoginStore } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { state, error, ...props } = router.query as Record<string, string>;
  const { toast } = useToast();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      setUserInfo(res.user);

      router.replace(
        loginStore?.lastRoute ? decodeURIComponent(loginStore?.lastRoute) : '/dashboard/apps'
      );
    },
    [setUserInfo, router, loginStore?.lastRoute]
  );

  const authProps = useCallback(
    async (props: Record<string, string>) => {
      try {
        const res = await oauthLogin({
          type: loginStore?.provider || OAuthEnum.sso,
          props,
          callbackUrl: `${location.origin}/login/provider`,
          inviterId: getInviterId(),
          bd_vid: getBdVId(),
          fastgpt_sem: getFastGPTSem(),
          sourceDomain: getSourceDomain()
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

        removeFastGPTSem();
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
      setLoginStore(undefined);
    },
    [loginStore?.provider, loginSuccess, router, setLoginStore, t, toast]
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

    console.log('SSO', { initd, loginStore, props, state });
    if (!props || !initd) return;

    if (isOauthLogging) return;

    isOauthLogging = true;

    (async () => {
      await clearToken();
      router.prefetch('/dashboard/apps');

      if (loginStore && loginStore.provider !== 'sso' && state !== loginStore.state) {
        toast({
          status: 'warning',
          title: t('common:support.user.login.security_failed')
        });
        setTimeout(() => {
          router.replace('/login');
        }, 1000);
        return;
      } else {
        authProps(props);
      }
    })();
  }, [initd, authProps, error, loginStore, loginStore?.state, router, state, t, toast, props]);

  return <Loading />;
};

export default provider;

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context))
    }
  };
}
