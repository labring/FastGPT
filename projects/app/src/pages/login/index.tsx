import React, { useCallback } from 'react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { clearToken } from '@/web/support/user/auth';
import { useMount } from 'ahooks';
import LoginModal from '@/pageComponents/login/LoginModal';

const Login = () => {
  const router = useRouter();
  const { lastRoute = '' } = router.query as { lastRoute: string };

  const loginSuccess = useCallback(() => {
    const decodeLastRoute = decodeURIComponent(lastRoute);

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
