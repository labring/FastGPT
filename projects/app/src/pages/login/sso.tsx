import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useChatStore } from '@/web/core/chat/context/storeChat';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken, setToken } from '@/web/support/user/auth';
import { ssoLogin } from '@/web/support/user/api';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';

let isOauthLogging = false;

const provider = () => {
  const { t } = useTranslation();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { query } = router;
  const { toast } = useToast();

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      console.log('loginSuccess', res);
      setToken(res.token);
      setUserInfo(res.user);
      // init store
      setLastChatId('');
      setLastChatAppId('');
      router.push('/app/list');
    },
    [setLastChatId, setLastChatAppId, setUserInfo, router]
  );

  const handleSSO = useCallback(async () => {
    try {
      const res = await ssoLogin(query);

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
  }, [loginSuccess, query, router, t, toast]);

  useEffect(() => {
    if (query && Object.keys(query).length > 0) {
      if (isOauthLogging) return;

      isOauthLogging = true;

      (async () => {
        await clearToken();
        handleSSO();
      })();
    }
  }, [handleSSO, query]);

  return <Loading />;
};

export default provider;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
