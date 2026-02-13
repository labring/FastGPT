import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import type { LoginSuccessResponse } from '@/global/support/api/userRes.d';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { postFastLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { validateRedirectUrl } from '@/web/common/utils/uri';

const FastLogin = ({
  code,
  token,
  callbackUrl
}: {
  code: string;
  token: string;
  callbackUrl: string;
}) => {
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const loginSuccess = useCallback(
    (res: LoginSuccessResponse) => {
      setUserInfo(res.user);

      setTimeout(() => {
        router.push(validateRedirectUrl(callbackUrl));
      }, 100);
    },
    [setUserInfo, router, callbackUrl]
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
      ...(await serviceSideProps(content))
    }
  };
}

export default FastLogin;
