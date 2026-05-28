import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { postFastLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { validateRedirectUrl } from '@/web/common/utils/uri';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { useLoginRedirectAfterLogin } from '@/web/support/user/loginRedirect';

const FastLogin = ({
  code,
  token,
  callbackUrl,
  lastTmbId
}: {
  code: string;
  token: string;
  callbackUrl: string;
  lastTmbId?: string;
}) => {
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const resolveLoginRedirect = useLoginRedirectAfterLogin();
  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      const safeCallbackUrl = validateRedirectUrl(callbackUrl);
      const targetRoute = await resolveLoginRedirect({
        user: res.user,
        fallbackRoute: safeCallbackUrl,
        lastTmbId
      });

      setUserInfo(res.user);

      if (targetRoute) {
        setTimeout(() => {
          router.push(targetRoute);
        }, 100);
      }
    },
    [callbackUrl, lastTmbId, resolveLoginRedirect, router, setUserInfo]
  );

  const authCode = useCallback(
    async (code: string, token: string) => {
      try {
        const res = await postFastLogin({
          code,
          token
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
        await loginSuccess(res);
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
    [loginSuccess, router, t, toast]
  );

  useEffect(() => {
    clearToken();
    const safeCallbackUrl = validateRedirectUrl(callbackUrl);
    router.prefetch(safeCallbackUrl);
    authCode(code, token);
  }, [authCode, callbackUrl, code, router, token]);

  return <Loading />;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      code: content?.query?.code || '',
      token: content?.query?.token || '',
      callbackUrl: content?.query?.callbackUrl || '/dashboard/agent',
      lastTmbId: content?.query?.lastTmbId || '',
      ...(await serviceSideProps(content, ['login']))
    }
  };
}

export default FastLogin;
