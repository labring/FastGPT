import React from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useQuery } from '@tanstack/react-query';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { postSandboxProxyToken } from '@/web/core/skill/api';
import { SkillDetailContext } from '../context';
import {
  SANDBOX_PROXY_AUTH_REFRESH_PATH,
  SANDBOX_PROXY_CODE_SERVER_PATH
} from '@fastgpt/global/core/ai/sandbox/proxyToken';

const getTokenRefreshInterval = (ttlSeconds: number) => {
  const ttlMs = Math.max(ttlSeconds, 1) * 1000;
  const safetyMs = Math.min(60 * 1000, Math.max(5 * 1000, ttlMs * 0.1));
  return Math.max(ttlMs - safetyMs, 5 * 1000);
};

const normalizePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

const appendToken = (path: string, token: string) => {
  const normalized = normalizePath(path);
  const separator = normalized.includes('?') ? '&' : '?';
  return `${normalized}${separator}_t=${encodeURIComponent(token)}`;
};

function SandboxFrame({
  sandboxId,
  origin,
  token
}: {
  sandboxId: string;
  origin: string;
  token: string;
}) {
  const [bootstrapToken] = React.useState(token);
  const src = `${origin}${appendToken(SANDBOX_PROXY_CODE_SERVER_PATH, bootstrapToken)}`;
  const refreshSrc =
    token === bootstrapToken
      ? null
      : `${origin}${SANDBOX_PROXY_AUTH_REFRESH_PATH}?_t=${encodeURIComponent(token)}`;

  return (
    <>
      {refreshSrc && (
        <img
          key={token}
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
    </>
  );
}

const SandboxIframe = () => {
  const sandboxEndpoint = useContextSelector(SkillDetailContext, (v) => v.sandboxEndpoint);
  const proxyBase = useSystemStore((s) => s.feConfigs?.sandboxProxy?.base);
  const proxyScheme = useSystemStore((s) => s.feConfigs?.sandboxProxy?.scheme) ?? 'http';
  const tokenTtl = useSystemStore((s) => s.feConfigs?.sandboxProxy?.tokenTtl) ?? 1800;
  const tokenRefreshInterval = getTokenRefreshInterval(tokenTtl);
  const sandboxId = sandboxEndpoint?.sandboxId;

  const { data: tokenData } = useQuery({
    queryKey: ['sandboxProxyToken', sandboxId],
    queryFn: () => postSandboxProxyToken({ sandboxId: sandboxId! }),
    enabled: !!sandboxId && !!proxyBase,
    // 提前过期刷新；新 token 走下面的隐藏 img 写回 cookie，不重载 iframe。
    staleTime: tokenRefreshInterval,
    refetchInterval: tokenRefreshInterval,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });

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
        sandboxProxy.base is not configured
      </Box>
    );
  }
  if (!sandboxId || !tokenData) {
    return (
      <Box w={'100%'} h={'100%'} display="flex" alignItems="center" justifyContent="center">
        <Spinner />
      </Box>
    );
  }

  // 子域用于隔离 code-server 的绝对 URL/WS/cookie；provider path 由 sandbox-proxy 内部解析。
  const sandboxOrigin = `${proxyScheme}://${sandboxId}.${proxyBase}`;

  return (
    <Box w={'100%'} h={'100%'}>
      <SandboxFrame
        key={sandboxId}
        sandboxId={sandboxId}
        origin={sandboxOrigin}
        token={tokenData.token}
      />
    </Box>
  );
};

export default React.memo(SandboxIframe);
