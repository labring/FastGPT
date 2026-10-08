import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { postFastLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { validateRedirectUrl } from '@/web/common/utils/uri';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { useLoginRedirectAfterLogin } from '@/web/support/user/loginRedirect';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { getFastGPTSem, onFastGPTLoginSuccess } from '@/web/support/marketing/utils';
import { resetUserModelCatalogAfterLogin } from '@/web/core/ai/model/useUserModelStore';

/** 使用 CSR 门禁恢复后的凭据完成登录；相同 code/token 在本次挂载中只消费一次。 */
const FastLogin = () => {
  const router = useRouter();
  const {
    code = '',
    token = '',
    callbackUrl = '/dashboard/agent',
    lastTmbId = ''
  } = router.query as {
    code?: string;
    token?: string;
    callbackUrl?: string;
    lastTmbId?: string;
  };

  const { setUserInfo } = useUserStore();
  const { toast } = useToast();
  const { t, i18n } = useSafeTranslation();
  const resolveLoginRedirect = useLoginRedirectAfterLogin();
  const handledCredentialsRef = useRef<{ code: string; token: string }>();
  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      const safeCallbackUrl = validateRedirectUrl(callbackUrl);
      const targetRoute = await resolveLoginRedirect({
        user: res.user,
        fallbackRoute: safeCallbackUrl,
        lastTmbId
      });

      resetUserModelCatalogAfterLogin();
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
          token,
          fastgpt_sem: getFastGPTSem(),
          language: i18n.language as LangEnum
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
        await onFastGPTLoginSuccess(loginSuccess, res);
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
    [i18n.language, loginSuccess, router, t, toast]
  );

  useEffect(() => {
    // code 为一次性凭据；路由对象或翻译函数更新不能重复消费，同页新凭据仍允许登录。
    const handledCredentials = handledCredentialsRef.current;
    if (handledCredentials?.code === code && handledCredentials.token === token) return;
    handledCredentialsRef.current = { code, token };

    clearToken();
    const safeCallbackUrl = validateRedirectUrl(callbackUrl);
    router.prefetch(safeCallbackUrl);
    authCode(code, token);
  }, [authCode, callbackUrl, code, router, token]);

  return <Loading />;
};

export default FastLogin;
