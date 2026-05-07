import React from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useQuery } from '@tanstack/react-query';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { postSandboxProxyToken } from '@/web/core/skill/api';
import { SkillDetailContext } from '../context';
import { SANDBOX_PROXY_AUTH_REFRESH_PATH } from '@fastgpt/global/core/ai/sandbox/proxyToken';

const getTokenRefreshInterval = (ttlSeconds: number) => {
  const ttlMs = Math.max(ttlSeconds, 1) * 1000;
  const safetyMs = Math.min(60 * 1000, Math.max(5 * 1000, ttlMs * 0.1));
  return Math.max(ttlMs - safetyMs, 5 * 1000);
};

const SandboxIframe = () => {
  const sandboxEndpoint = useContextSelector(SkillDetailContext, (v) => v.sandboxEndpoint);
  const proxyBase = useSystemStore((s) => s.feConfigs?.sandbox_proxy_base);
  const proxyScheme = useSystemStore((s) => s.feConfigs?.sandbox_proxy_scheme) ?? 'http';
  const tokenTtl = useSystemStore((s) => s.feConfigs?.sandbox_proxy_token_ttl) ?? 3600;
  const tokenRefreshInterval = getTokenRefreshInterval(tokenTtl);
  const providerSandboxId = sandboxEndpoint?.providerSandboxId;

  const { data: tokenData } = useQuery({
    queryKey: ['sandboxProxyToken', providerSandboxId],
    queryFn: () => postSandboxProxyToken({ sandboxId: providerSandboxId! }),
    enabled: !!sandboxEndpoint && !!proxyBase,
    // 提前过期刷新；新 token 走下面的隐藏 img 写回 cookie，不重载 iframe。
    staleTime: tokenRefreshInterval,
    refetchInterval: tokenRefreshInterval,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });

  // 锁定每个 sandbox 的首个 token，iframe src 不变，后续刷新走隐藏 img。
  const [bootstrap, setBootstrap] = React.useState<{ sandboxId: string; token: string } | null>(
    null
  );
  if (providerSandboxId && tokenData?.token && bootstrap?.sandboxId !== providerSandboxId) {
    setBootstrap({ sandboxId: providerSandboxId, token: tokenData.token });
  }

  if (!sandboxEndpoint) return null;
  if (!proxyBase) {
    return (
      <Box
        w={'100%'}
        h={'100%'}
        display="flex"
        alignItems="center"
        justifyContent="center"
        color="red.500"
      >
        sandbox_proxy_base is not configured
      </Box>
    );
  }
  if (!tokenData || !bootstrap || bootstrap.sandboxId !== providerSandboxId) {
    return (
      <Box w={'100%'} h={'100%'} display="flex" alignItems="center" justifyContent="center">
        <Spinner />
      </Box>
    );
  }

  // 子域路由到 sandbox + /proxy/8080/ 转发到 code-server；用子域而非 path 是为了 code-server 的绝对 URL/WS 共用 cookie。
  const sandboxOrigin = `${proxyScheme}://${bootstrap.sandboxId}.${proxyBase}`;
  const src = `${sandboxOrigin}/proxy/8080/?_t=${encodeURIComponent(bootstrap.token)}`;
  const refreshSrc =
    tokenData.token === bootstrap.token
      ? null
      : `${sandboxOrigin}${SANDBOX_PROXY_AUTH_REFRESH_PATH}?_t=${encodeURIComponent(tokenData.token)}`;

  return (
    <Box w={'100%'} h={'100%'}>
      {refreshSrc && (
        <img
          key={tokenData.token}
          alt=""
          referrerPolicy="no-referrer"
          src={refreshSrc}
          style={{ display: 'none' }}
        />
      )}
      <iframe
        src={src}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-presentation allow-same-origin"
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </Box>
  );
};

export default React.memo(SandboxIframe);
