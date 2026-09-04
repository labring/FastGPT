import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { oauthLogin } from '@/web/support/user/api';
import { submitAccountCancellation } from '@/web/support/user/account/cancellation/api';
import { authorizePasswordChange } from '@/web/support/user/account/password/api';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import {
  getBdVId,
  getFastGPTSem,
  getMsclkid,
  onFastGPTLoginSuccess
} from '@/web/support/marketing/utils';
import { postAcceptInvitationLink } from '@/web/support/user/team/api';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { validateRedirectUrl } from '@/web/common/utils/uri';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { useLoginRedirectAfterLogin } from '@/web/support/user/loginRedirect';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { resetUserModelCatalogAfterLogin } from '@/web/core/ai/model/useUserModelStore';

const provider = () => {
  const { t, i18n } = useTranslation();
  const { initd, loginStore, setLoginStore } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { state, error, ...props } = router.query as Record<string, string>;
  const { toast } = useToast();
  const resolveLoginRedirect = useLoginRedirectAfterLogin();
  const handledCallbackRef = useRef<string>();

  const lastRoute = loginStore?.lastRoute
    ? validateRedirectUrl(loginStore.lastRoute)
    : '/dashboard/agent';
  const lastTmbId = loginStore?.lastTmbId || '';
  const errorRedirectPage =
    loginStore?.flow === 'accountCancellation'
      ? '/account/cancel?confirmed=1'
      : loginStore?.flow === 'passwordChange'
        ? lastRoute
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

      resetUserModelCatalogAfterLogin();
      setUserInfo(res.user);

      if (targetRoute) {
        router.replace(targetRoute);
      }
    },
    [lastRoute, lastTmbId, resolveLoginRedirect, router, setUserInfo, t, toast]
  );

  const authProps = useCallback(
    async (props: Record<string, string>) => {
      try {
        if (loginStore?.flow === 'accountCancellation') {
          if (!props.code) {
            throw new Error('OAuth cancellation callback is incomplete');
          }
          const result = await submitAccountCancellation({
            method: `oauth/${loginStore.provider}` as any,
            payload: {
              callbackUrl: `${window.location.origin}/login/provider`,
              code: props.code,
              ...(state ? { state } : {}),
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

        if (loginStore?.flow === 'passwordChange') {
          if (!props.code) {
            throw new Error('OAuth password change callback is incomplete');
          }
          const result = await authorizePasswordChange({
            source: 'accountVerification',
            verification: {
              method: `oauth/${loginStore.provider}` as any,
              payload: {
                callbackUrl: `${window.location.origin}/login/provider`,
                code: props.code,
                ...(state ? { state } : {}),
                props
              }
            }
          });
          if (result.status !== 'authorized') {
            throw new Error('Password change verification is still pending');
          }
          usePasswordChangeStore.getState().setSession({
            sessionId: result.sessionId,
            expiredAt: result.expiredAt,
            required: loginStore.passwordChangeRequired === true
          });
          setLoginStore(undefined);
          await router.replace(lastRoute);
          return;
        }

        const res = await oauthLogin({
          type: loginStore?.provider || OAuthEnum.sso,
          props,
          callbackUrl: `${location.origin}/login/provider`,
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
          return setTimeout(() => {
            router.replace(errorRedirectPage);
          }, 1000);
        }

        await onFastGPTLoginSuccess(loginSuccess, res);
      } catch (error) {
        toast({
          status:
            loginStore?.flow === 'accountCancellation' || loginStore?.flow === 'passwordChange'
              ? 'error'
              : 'warning',
          title:
            loginStore?.flow === 'passwordChange'
              ? t('common:password_verification_failed')
              : loginStore?.flow === 'accountCancellation'
                ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
                : getErrText(error, t('common:support.user.login.error'))
        });
        setTimeout(() => {
          router.replace(errorRedirectPage);
        }, 1000);
      }
      setLoginStore(undefined);
    },
    [
      errorRedirectPage,
      i18n.language,
      loginStore,
      loginSuccess,
      lastRoute,
      router,
      setLoginStore,
      setUserInfo,
      state,
      t,
      toast
    ]
  );

  useEffect(() => {
    if (error) {
      toast({
        status:
          loginStore?.flow === 'accountCancellation' || loginStore?.flow === 'passwordChange'
            ? 'error'
            : 'warning',
        title:
          loginStore?.flow === 'passwordChange'
            ? t('common:password_verification_failed')
            : loginStore?.flow === 'accountCancellation'
              ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
              : t('common:support.user.login.Provider error')
      });
      router.replace(errorRedirectPage);
      return;
    }

    if (!props || !initd) return;

    const callbackKey = router.asPath;
    if (handledCallbackRef.current === callbackKey) return;
    handledCallbackRef.current = callbackKey;

    (async () => {
      if (!loginStore?.flow || loginStore.flow === 'login') {
        await retryFn(async () => clearToken());
      }
      router.prefetch('/dashboard/agent');
      if (loginStore && loginStore.provider !== 'sso' && state !== loginStore.state) {
        toast({
          status:
            loginStore?.flow === 'accountCancellation' || loginStore?.flow === 'passwordChange'
              ? 'error'
              : 'warning',
          title:
            loginStore?.flow === 'passwordChange'
              ? t('common:password_verification_failed')
              : loginStore?.flow === 'accountCancellation'
                ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
                : t('common:support.user.login.security_failed')
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
      ...(await serviceSideProps(context, ['login', 'account_info']))
    }
  };
}
