import React, { useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useChatStore } from '@/web/core/chat/context/storeChat';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken, setToken } from '@/web/support/user/auth';
import { ssoLogin } from '@/web/support/user/api';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { serviceSideProps } from '@/web/common/utils/i18n';

const provider = () => {
  const { t } = useTranslation();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();
  const { query } = router;

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

  const { run: handleSSO } = useRequest2(() => ssoLogin(query), {
    onSuccess: loginSuccess,
    errorToast: t('common:support.user.login.error')
  });

  useEffect(() => {
    if (query && Object.keys(query).length > 0) {
      clearToken();
      handleSSO();
    }
  }, []);

  return <Loading />;
};

export default provider;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
