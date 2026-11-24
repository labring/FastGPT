import { useCallback, useEffect, useMemo, useState, type Dispatch } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { createAuthorizationUrl } from '@fastgpt/global/support/user/account/verification/authorization';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getSsoAuthURL, getSsoSources, getWecomRedirectURL } from '@/web/support/user/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { getLoginMethodItems, type LoginMethodItem } from '@/web/support/user/login/utils';

/** 直连 OAuth 的 Provider 映射，登录与重新认证共用同一套授权地址构造逻辑。 */
const directOAuthProviders = {
  github: OAuthEnum.github,
  google: OAuthEnum.google,
  microsoft: OAuthEnum.microsoft
} as const;

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

  // 多 SSO 来源：登录页拉取来源列表（pro 代理 sso 服务）；失败/为空不影响单按钮渲染
  const [ssoSources, setSsoSources] = useState<
    Array<{ id: string; provider: string; name: string; source: string }>
  >([]);
  useEffect(() => {
    if (!feConfigs.sso?.enabled) return;
    getSsoSources()
      .then(({ sources }) => setSsoSources(sources ?? []))
      .catch(() => setSsoSources([]));
  }, [feConfigs.sso?.enabled]);

  const methods = useMemo(
    () =>
      getLoginMethodItems({
        mode,
        pageType,
        feConfigs,
        ssoSources,
        labels: {
          wechat: t('common:support.user.login.Wechat'),
          password: t('common:support.user.login.Password login'),
          google: t('common:support.user.login.Google'),
          github: t('common:support.user.login.Github'),
          microsoft: t('common:support.user.login.Microsoft')
        }
      }),
    [feConfigs, mode, pageType, t, ssoSources]
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
        const state = getNanoid(32);
        const url = await (async () => {
          if (method.provider === 'sso') {
            // 多来源时带 source 路由（sso 服务按实例出授权链接）；单来源缺省走 SSO_PROVIDER
            return getSsoAuthURL({
              redirectUri: callbackUrl,
              isWecomWorkTerminal,
              ...(method.source ? { source: method.source } : {})
            });
          }
          if (method.provider === 'wecom') {
            return getWecomRedirectURL({ redirectUri: callbackUrl, state, isWecomWorkTerminal });
          }

          return createAuthorizationUrl({
            provider: directOAuthProviders[method.provider],
            redirectUri: callbackUrl,
            state,
            interaction: 'login',
            config: feConfigs.oauth
          });
        })();

        setLoginStore({
          provider: method.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          lastTmbId,
          state
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
    [computedLastRoute, feConfigs, lastTmbId, router, setLoginStore, setPageType, t, toast]
  );

  return { methods, startLogin };
};
