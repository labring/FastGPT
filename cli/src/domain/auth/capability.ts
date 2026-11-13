import type { ResolvedAuthContext } from './auth-resolver';
import type { WhoamiProbeResult } from './probe/probe-chain';

export type CapabilitySummary = {
  credentialKind: string;
  availableScopes: string[];
  restrictedScopes: string[];
};

/**
 * 根据当前生效凭据类型推导 CLI 操作能力矩阵，供 `doctor` 与 `auth status` 展示。
 */
export function buildCapabilitySummary({
  probe,
  resolved
}: {
  probe?: WhoamiProbeResult;
  resolved?: ResolvedAuthContext;
}): CapabilitySummary {
  const kind = (() => {
    if (probe?.authType === 'token') return 'token';
    if (probe?.apiKeyType === 'app') return 'appKey';
    if (probe?.apiKeyType === 'personal') return 'personalKey';
    return resolved?.credential?.kind;
  })();

  if (!kind) {
    return {
      credentialKind: 'none',
      availableScopes: [],
      restrictedScopes: ['all authenticated endpoints']
    };
  }

  if (kind === 'token') {
    return {
      credentialKind: 'token',
      availableScopes: ['app (read/write/publish)', 'workflow', 'dataset', 'chat', 'model', 'team'],
      restrictedScopes: []
    };
  }

  if (kind === 'appKey') {
    return {
      credentialKind: 'appKey',
      availableScopes: ['chat completions (bound app)', 'app logs (bound app)'],
      restrictedScopes: ['dataset', 'app management/publish', 'team', 'other apps']
    };
  }

  return {
    credentialKind: 'personalKey',
    availableScopes: ['chat', 'dataset', 'app logs', 'model', 'selected core endpoints'],
    restrictedScopes: ['app detail/update/copy/publish (requires session token)', 'team admin']
  };
}
