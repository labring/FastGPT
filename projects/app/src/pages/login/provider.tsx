import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { oauthLogin } from '@/web/support/user/api';
import { submitAccountCancellation } from '@/web/support/user/account/cancellation/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import {
  getBdVId,
  getFastGPTSem,
  getInviterId,
  getMsclkid,
  onFastGPTLoginSuccess
} from '@/web/support/marketing/utils';
import { postAcceptInvitationLink } from '@/web/support/user/team/api';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { validateRedirectUrl } from '@/web/common/utils/uri';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { useLoginRedirectAfterLogin } from '@/web/support/user/loginRedirect';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import {
  resolveOAuthLoginCallback,
  type ResolvedOAuthLoginCallback
} from '@/web/support/user/account/verification/oauth';

let isOauthLogging = false;

const provider = () => {
  const { t, i18n } = useTranslation();
  const { initd, loginStore, setLoginStore } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { state, error, code, ...rawProps } = router.query;
  const callbackProps = Object.fromEntries(
    Object.entries(rawProps).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
  const { toast } = useToast();
  const resolveLoginRedirect = useLoginRedirectAfterLogin();

  const lastRoute = loginStore?.lastRoute
    ? validateRedirectUrl(loginStore.lastRoute)
    : '/dashboard/agent';
  const lastTmbId = loginStore?.lastTmbId || '';
  const errorRedirectPage =
    loginStore?.flow === 'accountCancellation'
      ? '/account/cancel?confirmed=1'
      : lastRoute.startsWith('/chat')
        ? lastRoute
        : '/login';

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      const decodeLastRoute = validateRedirectUrl(lastRoute);

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

      const targetRoute = navigateTo
        ? await resolveLoginRedirect({
            user: res.user,
            fallbackRoute: navigateTo,
            lastTmbId
          })
        : undefined;

      setUserInfo(res.user);

      if (targetRoute) {
        router.replace(targetRoute);
      }
    },
    [lastRoute, lastTmbId, resolveLoginRedirect, router, setUserInfo, t, toast]
  );

  const completeOauthLogin = useCallback(
    async ({
      callback,
      props
    }: {
      callback: ResolvedOAuthLoginCallback;
      props: Record<string, string>;
    }) => {
      if (!loginStore) return;
      try {
        if (loginStore.flow === 'accountCancellation') {
          const result = await submitAccountCancellation({
            method: `oauth/${callback.provider}` as any,
            payload: {
              callbackUrl: loginStore.callbackUrl,
              code: callback.code,
              ...(callback.state !== undefined ? { state: callback.state } : {}),
              props
            }
          });
          if (result.status !== 'pending') {
            throw new Error('Account cancellation verification is still pending');
          }
          toast({
            status: 'success',
            title: t('account_info:account_cancellation_submit_success', '注销提交成功')
          });
          setUserInfo(null);
          setLoginStore(undefined);
          await router.replace('/login?lastRoute=/account/cancel');
          return;
        }

        const res = await oauthLogin({
          ...callback,
          props,
          callbackUrl: loginStore.callbackUrl,
          inviterId: getInviterId(),
          bd_vid: getBdVId(),
          msclkid: getMsclkid(),
          fastgpt_sem: getFastGPTSem(),
          language: i18n.language as LangEnum
        });

        if (!res) {
          toast({
            status: 'warning',
            title: t('common:support.user.login.error')
          });
          setTimeout(() => {
            router.replace(errorRedirectPage);
          }, 1000);
          return;
        }

        await onFastGPTLoginSuccess(loginSuccess, res);
      } catch (error) {
        toast({
          status: loginStore.flow === 'accountCancellation' ? 'error' : 'warning',
          title:
            loginStore.flow === 'accountCancellation'
              ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
              : getErrText(error, t('common:support.user.login.error'))
        });
        setTimeout(() => {
          router.replace(errorRedirectPage);
        }, 1000);
      } finally {
        setLoginStore(undefined);
      }
    },
    [
      errorRedirectPage,
      i18n.language,
      loginStore,
      loginSuccess,
      router,
      setLoginStore,
      setUserInfo,
      t,
      toast
    ]
  );

  useEffect(() => {
    if (error) {
      toast({
        status: loginStore?.flow === 'accountCancellation' ? 'error' : 'warning',
        title:
          loginStore?.flow === 'accountCancellation'
            ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
            : t('common:support.user.login.Provider error')
      });
      router.replace(errorRedirectPage);
      return;
    }

    if (!router.isReady || !initd) return;

    if (isOauthLogging) return;

    isOauthLogging = true;

    (async () => {
      const currentCallbackUrl = `${location.origin}/login/provider`;
      const callback = resolveOAuthLoginCallback({
        loginStore,
        code,
        state,
        currentCallbackUrl
      });
      if (!callback) {
        toast({
          status: loginStore?.flow === 'accountCancellation' ? 'error' : 'warning',
          title:
            loginStore?.flow === 'accountCancellation'
              ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
              : t('common:support.user.login.security_failed')
        });
        setTimeout(() => {
          router.replace(errorRedirectPage);
        }, 1000);
        setLoginStore(undefined);
        return;
      }

      if (loginStore?.flow !== 'accountCancellation') {
        await retryFn(async () => clearToken());
      }
      router.prefetch('/dashboard/agent');
      await completeOauthLogin({ callback, props: callbackProps });
    })();
  }, [
    callbackProps,
    code,
    completeOauthLogin,
    error,
    errorRedirectPage,
    initd,
    loginStore,
    router,
    setLoginStore,
    state,
    t,
    toast
  ]);

  return <Loading />;
};

export default provider;

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['login', 'account_info']))
    }
  };
}
