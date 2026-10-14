import React, { useCallback } from 'react';
import { useRouter } from 'next/router';
import { initClientAfterLogin } from '@/web/support/user/auth';
import { useMount } from 'ahooks';
import LoginModal from '@/pageComponents/login/LoginModal';
import { subRoute } from '@fastgpt/web/common/system/utils';
import { validateRedirectUrl } from '@/web/common/utils/uri';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { useLoginRedirectAfterLogin } from '@/web/support/user/loginRedirect';

const Login = () => {
  const router = useRouter();
  const { lastRoute = '', lastTmbId = '' } = router.query as {
    lastRoute: string;
    lastTmbId?: string;
  };
  const resolveLoginRedirect = useLoginRedirectAfterLogin();

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      const decodeLastRoute = validateRedirectUrl(lastRoute);

      const navigateTo = await (async () => {
        if (decodeLastRoute.startsWith(`${subRoute}/config`)) {
          return '/dashboard/agent';
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

      await initClientAfterLogin(res.user);

      if (targetRoute) {
        router.replace(targetRoute);
      }
    },
    [lastRoute, lastTmbId, resolveLoginRedirect, router]
  );

  useMount(() => {
    router.prefetch('/dashboard/agent');
  });

  return <LoginModal onSuccess={loginSuccess} />;
};

export default Login;
