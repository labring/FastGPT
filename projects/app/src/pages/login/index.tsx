import React, { useCallback } from 'react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { clearToken } from '@/web/support/user/auth';
import { useMount } from 'ahooks';
import LoginModal from '@/pageComponents/login/LoginModal';
import { postAcceptInvitationLink } from '@/web/support/user/team/api';

const Login = () => {
  const router = useRouter();
  const { lastRoute = '' } = router.query as { lastRoute: string };

  const loginSuccess = useCallback(async () => {
    const decodeLastRoute = decodeURIComponent(lastRoute);
    if (decodeLastRoute.includes('/account/team?invitelinkid=')) {
      const id = decodeLastRoute.split('invitelinkid=')[1];
      await postAcceptInvitationLink(id);
      router.push('/account/team');
      return;
    }
    const navigateTo =
      decodeLastRoute && !decodeLastRoute.includes('/login') && decodeLastRoute.startsWith('/')
        ? lastRoute
        : '/dashboard/apps';

    router.push(navigateTo);
  }, [lastRoute, router]);

  useMount(() => {
    clearToken();
    router.prefetch('/dashboard/apps');
  });

  return <LoginModal onSuccess={loginSuccess} />;
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['app', 'user', 'login']))
    }
  };
}

export default Login;
