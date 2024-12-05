import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken, setToken } from '@/web/support/user/auth';
import { postFastLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
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
    (res: ResLogin) => {
      setToken(res.token);
      setUserInfo(res.user);

      setTimeout(() => {
        router.push(decodeURIComponent(callbackUrl));
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
    [loginSuccess, router, toast]
  );

  useEffect(() => {
    clearToken();
    router.prefetch(callbackUrl);
    authCode(code, token);
  }, []);

  return <Loading />;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      code: content?.query?.code || '',
      token: content?.query?.token || '',
      callbackUrl: content?.query?.callbackUrl || '/app/list',
      ...(await serviceSideProps(content))
    }
  };
}

export default FastLogin;
