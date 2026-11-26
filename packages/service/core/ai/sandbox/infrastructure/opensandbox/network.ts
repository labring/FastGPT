/**
 * OpenSandbox 基础设施层：按运行时区分的容器出网代理与网络隔离策略。
 *
 * - Kubernetes：管理端配置 `httpProxy`/`httpsProxy`/`noProxy`，注入容器代理环境变量并由集群策略放行代理端口；
 * - Docker：维持完整私网封禁 `OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES`，开启 `enableUpstreamProxy` 时下发
 *   `credentialProxy: { enabled: true }` 以对接 OpenSandbox 服务端 `[egress.upstream_proxy]`。
 */
import { isValidHttpUrl } from '@fastgpt/global/common/string/url';
import type { OpenSandboxRuntime, SandboxCreateSpec } from './type';

const OPEN_SANDBOX_DEFAULT_NO_PROXY_ENTRIES = ['localhost', '127.0.0.1', '::1'] as const;

const OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES = [
  { action: 'deny' as const, target: 'localhost' },
  { action: 'deny' as const, target: '127.0.0.0/8' },
  { action: 'deny' as const, target: '::1/128' },
  { action: 'deny' as const, target: '10.0.0.0/8' },
  { action: 'deny' as const, target: '100.64.0.0/10' },
  { action: 'deny' as const, target: '169.254.0.0/16' },
  { action: 'deny' as const, target: '172.16.0.0/12' },
  { action: 'deny' as const, target: '192.168.0.0/16' },
  { action: 'deny' as const, target: '224.0.0.0/4' },
  { action: 'deny' as const, target: 'fc00::/7' },
  { action: 'deny' as const, target: 'fe80::/10' },
  { action: 'deny' as const, target: '*.local' },
  { action: 'deny' as const, target: 'host.docker.internal' },
  { action: 'deny' as const, target: 'host.orb.internal' },
  { action: 'deny' as const, target: 'docker.orb.internal' },
  { action: 'deny' as const, target: 'gateway.orb.internal' },
  { action: 'deny' as const, target: 'proxyproxy.orb.internal' },
  { action: 'deny' as const, target: '*.orb.internal' },
  { action: 'deny' as const, target: '*.orb.local' }
];

const OPEN_SANDBOX_PROTECTED_NETWORK_DENY_TARGETS = new Set(
  OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES.map(({ target }) => target)
);

type SandboxOutboundProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
};

/**
 * 构建 Kubernetes 运行时容器出网代理环境变量；Docker 下由 OpenSandbox upstream_proxy 处理，不注入环境变量。
 */
export function buildSandboxOutboundProxyEnv({
  runtime,
  proxyConfig
}: {
  runtime: OpenSandboxRuntime;
  proxyConfig: SandboxOutboundProxyConfig;
}): Record<string, string> {
  if (runtime !== 'kubernetes') {
    return {};
  }

  const httpProxy = isValidHttpUrl(proxyConfig.httpProxy) ? proxyConfig.httpProxy!.trim() : '';
  const httpsProxy = isValidHttpUrl(proxyConfig.httpsProxy) ? proxyConfig.httpsProxy!.trim() : '';

  if (!httpProxy && !httpsProxy) {
    return {};
  }

  const noProxyEntries = new Map<string, string>(
    OPEN_SANDBOX_DEFAULT_NO_PROXY_ENTRIES.map((entry) => [entry, entry])
  );
  for (const raw of (proxyConfig.noProxy ?? '').split(',')) {
    const entry = raw.trim();
    const key = entry.toLowerCase();
    if (entry && !noProxyEntries.has(key)) {
      noProxyEntries.set(key, entry);
    }
  }

  const mergedNoProxy = [...noProxyEntries.values()].join(',');
  return {
    ...(httpProxy ? { HTTP_PROXY: httpProxy, http_proxy: httpProxy } : {}),
    ...(httpsProxy ? { HTTPS_PROXY: httpsProxy, https_proxy: httpsProxy } : {}),
    NO_PROXY: mergedNoProxy,
    no_proxy: mergedNoProxy
  };
}

/**
 * 按运行时构建 OpenSandbox 容器网络创建参数：
 * - Kubernetes：不下发 `networkPolicy` 与 `credentialProxy`（交由集群策略与环境变量代理）；
 * - Docker：下发完整内置私网封禁（过滤调用方 `allow` 规则），并在开启上游代理时附带 `credentialProxy`。
 */
export function buildOpenSandboxNetworkOptions({
  runtime,
  enableUpstreamProxy,
  networkPolicy
}: {
  runtime: OpenSandboxRuntime;
  enableUpstreamProxy?: boolean;
  networkPolicy?: SandboxCreateSpec['networkPolicy'];
}): Pick<SandboxCreateSpec, 'networkPolicy' | 'credentialProxy'> {
  if (runtime !== 'docker') {
    return {};
  }

  return {
    networkPolicy: {
      defaultAction: 'allow',
      egress: [
        ...OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES,
        ...(networkPolicy?.egress?.filter(
          ({ action, target }) =>
            action === 'deny' &&
            (!target || !OPEN_SANDBOX_PROTECTED_NETWORK_DENY_TARGETS.has(target))
        ) ?? [])
      ]
    },
    ...(enableUpstreamProxy ? { credentialProxy: { enabled: true } } : {})
  };
}
