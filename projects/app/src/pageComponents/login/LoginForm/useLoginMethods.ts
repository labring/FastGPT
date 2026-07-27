import { useCallback, useMemo, type Dispatch } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { createOauthLogin } from '@/web/support/user/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { getLoginMethodItems, type LoginMethodItem } from '@/web/support/user/login/utils';

/**
 * 统一发起页面切换或 OAuth，并将纯函数生成的渠道列表绑定到当前登录上下文。
 */
export const useLoginMethods = ({
  mode,
  pageType,
  setPageType
}: {
  mode: 'selection' | 'alternatives';
  pageType?: `${LoginPageTypeEnum}`;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { feConfigs, setLoginStore } = useSystemStore();
  const { lastRoute = '/dashboard/agent', lastTmbId = '' } = router.query as {
    lastRoute: string;
    lastTmbId?: string;
  };

  const computedLastRoute = useMemo(
    () => (router.pathname === '/chat' ? router.asPath : lastRoute),
    [lastRoute, router.asPath, router.pathname]
  );

  const methods = useMemo(
    () =>
      getLoginMethodItems({
        mode,
        pageType,
        feConfigs,
        labels: {
          wechat: t('common:support.user.login.Wechat'),
          wecom: t('common:support.user.login.Wecom'),
          password: t('common:support.user.login.Password login'),
          google: t('common:support.user.login.Google'),
          github: t('common:support.user.login.Github'),
          microsoft: t('common:support.user.login.Microsoft')
        }
      }),
    [feConfigs, mode, pageType, t]
  );

  const startLogin = useCallback(
    async (method: LoginMethodItem) => {
      if (method.type === 'page') {
        setPageType(method.pageType);
        return;
      }

      try {
        const callbackUrl = `${window.location.origin}/login/provider`;
        const isWecomWorkTerminal = checkIsWecomTerminal();
        const { state, url } = await createOauthLogin({
          provider: method.provider,
          callbackUrl,
          isWecomWorkTerminal
        });

        setLoginStore({
          provider: method.provider,
          lastRoute: computedLastRoute,
          lastTmbId,
          state,
          callbackUrl
        });
        await router.replace(url, '_self');
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, t('common:support.user.login.error'))
        });
        throw error;
      }
    },
    [computedLastRoute, lastTmbId, router, setLoginStore, setPageType, t, toast]
  );

  return { methods, startLogin };
};
