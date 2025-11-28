import { getErrText } from '@fastgpt/global/common/error/utils';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect } from 'react';
import type { LoginSuccessResponse } from '@/global/support/api/userRes.d';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  getBdVId,
  getFastGPTSem,
  getInviterId,
  getMsclkid,
  getSourceDomain,
  removeFastGPTSem
} from '@/web/support/marketing/utils';
import { oauthLogin } from '@/web/support/user/api';
import { clearToken } from '@/web/support/user/auth';
import { postAcceptInvitationLink } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

let isOauthLogging = false;

const provider = () => {
  const { t } = useTranslation();
  const { initd, loginStore, setLoginStore } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { state, error, ...props } = router.query as Record<string, string>;
  const { toast } = useToast();

  const lastRoute = loginStore?.lastRoute
    ? decodeURIComponent(loginStore.lastRoute)
    : '/dashboard/agent';
  const errorRedirectPage = lastRoute.startsWith('/chat') ? lastRoute : '/login';

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponse) => {
      const decodeLastRoute = decodeURIComponent(lastRoute);
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

        return decodeLastRoute &&
          !decodeLastRoute.includes('/login') &&
          decodeLastRoute.startsWith('/')
          ? lastRoute
          : '/dashboard/agent';
      })();

      navigateTo && router.replace(navigateTo);
    },
    [setUserInfo, router, lastRoute]
  );

  const authProps = useCallback(
    async (props: Record<string, string>) => {
      try {
        // 如果是 360 SSO (有 sid 参数)，添加 ref 参数
        // ref 应该是完整的回调 URL（不包含 sid 参数）
        const requestProps = props.sid
          ? {
              ...props,
              ref: props.__qihoo_state
                ? `${location.origin}/login/provider?__qihoo_state=${props.__qihoo_state}`
                : `${location.origin}/login/provider`
            }
          : props;

        const res = await oauthLogin({
          type: loginStore?.provider || OAuthEnum.sso,
          props: requestProps,
          callbackUrl: `${location.origin}/login/provider`,
          inviterId: getInviterId(),
          bd_vid: getBdVId(),
          msclkid: getMsclkid(),
          fastgpt_sem: getFastGPTSem(),
          sourceDomain: getSourceDomain()
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

      // 通用 SSO 不验证 state（因为可能使用 sid 等其他参数）
      if (loginStore && loginStore.provider === 'sso') {
        authProps(props);
        return;
      }

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
