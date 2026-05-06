import React from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useQuery } from '@tanstack/react-query';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { postHeartbeatSandbox, postSandboxProxyToken } from '@/web/core/skill/api';
import { SkillDetailContext } from '../context';
import { SANDBOX_PROXY_AUTH_REFRESH_PATH } from '@fastgpt/global/core/ai/sandbox/proxyToken';

const SANDBOX_HEARTBEAT_INTERVAL = 60 * 1000;

const getTokenRefreshInterval = (ttlSeconds: number) => {
  const ttlMs = Math.max(ttlSeconds, 1) * 1000;
  const safetyMs = Math.min(60 * 1000, Math.max(5 * 1000, ttlMs * 0.1));
  return Math.max(ttlMs - safetyMs, 5 * 1000);
};

const SandboxIframe = () => {
  const sandboxEndpoint = useContextSelector(SkillDetailContext, (v) => v.sandboxEndpoint);
  const proxyBase = useSystemStore((s) => s.feConfigs?.sandbox_proxy_base);
  const proxyScheme = useSystemStore((s) => s.feConfigs?.sandbox_proxy_scheme) ?? 'http';
  const tokenTtl = useSystemStore((s) => s.feConfigs?.sandbox_proxy_token_ttl) ?? 600;
  const tokenRefreshInterval = getTokenRefreshInterval(tokenTtl);
  const [bootstrapToken, setBootstrapToken] = React.useState<string | null>(null);
  const providerSandboxId = sandboxEndpoint?.providerSandboxId;

  const { data: tokenData } = useQuery({
    queryKey: ['sandboxProxyToken', providerSandboxId],
    queryFn: () => postSandboxProxyToken({ sandboxId: providerSandboxId! }),
    enabled: !!sandboxEndpoint && !!proxyBase,
    // Refresh before the proxy cookie expires. The fresh token is written by a hidden
    // image request below so code-server can reconnect without reloading the main iframe.
    staleTime: tokenRefreshInterval,
    refetchInterval: tokenRefreshInterval,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });

  useQuery({
    queryKey: ['sandboxHeartbeat', providerSandboxId],
    queryFn: () => postHeartbeatSandbox({ sandboxId: providerSandboxId! }),
    enabled: !!providerSandboxId,
    refetchInterval: SANDBOX_HEARTBEAT_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });

  React.useEffect(() => {
    setBootstrapToken(null);
  }, [providerSandboxId]);

  React.useEffect(() => {
    if (!bootstrapToken && tokenData?.token) {
      setBootstrapToken(tokenData.token);
    }
  }, [bootstrapToken, tokenData?.token]);

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
  if (!tokenData || !bootstrapToken) {
    return (
      <Box w={'100%'} h={'100%'} display="flex" alignItems="center" justifyContent="center">
        <Spinner />
      </Box>
    );
  }

  // URL: `<scheme>://<sid>.<base>/proxy/8080/?_t=<jwt>`
  // Two-layer routing:
  //   - subdomain `<sid>.<base>` selects the sandbox (handled by sandbox-proxy)
  //   - `/proxy/8080/` is execd's "forward to inner port 8080" path (handled by execd
  //     inside the container and proxied to code-server)
  // code-server sees Host=<sid>.<base> so absolute URLs / vscode-remote URIs / WS
  // endpoints all stay on the same subdomain and ride the cookie.
  const sandboxOrigin = `${proxyScheme}://${sandboxEndpoint.providerSandboxId}.${proxyBase}`;
  const src = `${sandboxOrigin}/proxy/8080/?_t=${encodeURIComponent(bootstrapToken)}`;
  const refreshSrc =
    tokenData.token === bootstrapToken
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
