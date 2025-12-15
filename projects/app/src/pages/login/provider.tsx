import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LoginSuccessResponse } from '@/global/support/api/userRes.d';
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
  getMsclkid,
  getSourceDomain,
  removeFastGPTSem
} from '@/web/support/marketing/utils';
import { postAcceptInvitationLink } from '@/web/support/user/team/api';
import { retryFn } from '@fastgpt/global/common/system/utils';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { validateRedirectUrl } from '@/web/common/utils/uri';

let isOauthLogging = false;

const provider = () => {
  const { t, i18n } = useTranslation();
  const { initd, loginStore, setLoginStore } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { state, error, ...props } = router.query as Record<string, string>;
  const { toast } = useToast();

  const lastRoute = loginStore?.lastRoute
    ? validateRedirectUrl(loginStore.lastRoute)
    : '/dashboard/agent';
  const errorRedirectPage = lastRoute.startsWith('/chat') ? lastRoute : '/login';

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponse) => {
      const decodeLastRoute = validateRedirectUrl(lastRoute);
      setUserInfo(res.user);

      const navigateTo = await (async () => {
        if (res.user.team.status !== 'active') {
          if (decodeLastRoute.includes('/account/team?invitelinkid=')) {
            const id = decodeLastRoute.split('invitelinkid=')[1];
            await postAcceptInvitationLink(id);
            return '/dashboard/agent';
          } else {
            toast({
              status: 'warning',
              title: t('common:not_active_team')
            });
          }
        }

        return decodeLastRoute;
      })();

      navigateTo && router.replace(navigateTo);
    },
    [setUserInfo, router, lastRoute, t, toast]
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
          msclkid: getMsclkid(),
          fastgpt_sem: getFastGPTSem(),
          sourceDomain: getSourceDomain(),
          language: i18n.language as LangEnum
        });

        if (!res) {
          toast({
            status: 'warning',
            title: t('common:support.user.login.error')
          });
          return setTimeout(() => {
            router.replace(errorRedirectPage);
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
          router.replace(errorRedirectPage);
        }, 1000);
      }
      setLoginStore(undefined);
    },
    [errorRedirectPage, loginStore?.provider, loginSuccess, router, setLoginStore, t, toast]
  );

  useEffect(() => {
    if (error) {
      toast({
        status: 'warning',
        title: t('common:support.user.login.Provider error')
      });
      router.replace(errorRedirectPage);
      return;
    }

    if (!props || !initd) return;

    if (isOauthLogging) return;

    isOauthLogging = true;

    (async () => {
      await retryFn(async () => clearToken());
      router.prefetch('/dashboard/agent');

      if (loginStore && loginStore.provider !== 'sso' && state !== loginStore.state) {
        toast({
          status: 'warning',
          title: t('common:support.user.login.security_failed')
        });
        setTimeout(() => {
          router.replace(errorRedirectPage);
        }, 1000);
        return;
      } else {
        authProps(props);
      }
    })();
  }, [initd, authProps, error, loginStore, router, state, t, toast, props, errorRedirectPage]);

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
