import type { ConfigLoadResult, ConfigRepository } from '../../../infra/config/config-repository';
import type { SecretStore } from '../../../infra/secrets/secret-store';
import { getCliVersion, type GlobalCliOptions } from '../../../shared/types';
import { resolveEffectiveAuth, type ResolvedAuthContext } from '../../auth/auth-resolver';
import type { HttpClientFactory } from '../../auth/auth-service';
import {
  runWhoamiProbeChain,
  type WhoamiProbeHandler,
  type WhoamiProbeResult
} from '../../auth/probe/probe-chain';

export type DoctorCheckResult = {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  hint?: string;
};

export type DoctorRunContext = {
  global: GlobalCliOptions;
  env: NodeJS.ProcessEnv;
  configRepo: ConfigRepository;
  secretStore: SecretStore;
  createHttpClient: HttpClientFactory;
  probeHandlers: readonly WhoamiProbeHandler[];
  warnings: string[];
  configLoaded?: ConfigLoadResult;
  resolved?: ResolvedAuthContext;
  probeResult?: WhoamiProbeResult;
};

export type DoctorCheck = {
  readonly name: string;
  run: (ctx: DoctorRunContext) => Promise<DoctorCheckResult | undefined>;
};

const SESSION_EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;
const KEY_EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function createRuntimeCheck(): DoctorCheck {
  return {
    name: 'runtime',
    run: async () => {
      const cliVersion = getCliVersion();
      const bunVersion = (process.versions as Record<string, string | undefined>).bun;
      return {
        name: 'runtime',
        status: 'pass',
        message: bunVersion
          ? `cli=${cliVersion}, runtime=bun/${bunVersion} (${process.platform}-${process.arch})`
          : `cli=${cliVersion}, runtime=node/${process.versions.node} (${process.platform}-${process.arch})`
      };
    }
  };
}

export function createSecretStoreCheck(): DoctorCheck {
  return {
    name: 'secret_store',
    run: async (ctx) => {
      const backend = await ctx.secretStore.getBackendName(ctx.resolved?.profileName);
      return {
        name: 'secret_store',
        status: backend === 'keychain' ? 'pass' : 'warn',
        message:
          backend === 'keychain'
            ? 'Using system keychain for secret storage'
            : 'Using 0600 credentials.json file fallback (keychain unavailable or disabled)'
      };
    }
  };
}

export function createConfigCheck(): DoctorCheck {
  return {
    name: 'config_file',
    run: async (ctx) => {
      try {
        const loaded = await ctx.configRepo.read();
        ctx.configLoaded = loaded;
        ctx.warnings.push(...loaded.warnings);
        return {
          name: 'config_file',
          status: loaded.warnings.length > 0 ? 'warn' : 'pass',
          message:
            loaded.warnings.length > 0
              ? loaded.warnings.join('; ')
              : `Config loaded from ${loaded.configPath}`
        };
      } catch (error) {
        return {
          name: 'config_file',
          status: 'fail',
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

export function createAuthResolutionCheck(): DoctorCheck {
  return {
    name: 'auth_resolution',
    run: async (ctx) => {
      try {
        const resolved = await resolveEffectiveAuth({
          options: ctx.global,
          env: ctx.env,
          configRepo: ctx.configRepo,
          secretStore: ctx.secretStore,
          existingConfig: ctx.configLoaded?.config
        });
        ctx.resolved = resolved;
        ctx.warnings.push(...resolved.warnings);
        return {
          name: 'auth_resolution',
          status: resolved.credential ? 'pass' : 'warn',
          message: resolved.credential
            ? `Resolved ${resolved.credential.authType} from ${resolved.credential.source} (profile="${resolved.profileName}", baseUrl="${resolved.baseUrl}")`
            : `No credential configured for profile "${resolved.profileName}"`,
          ...(!resolved.credential
            ? {
                hint: `Run "fastgpt login --profile ${resolved.profileName}" or set FASTGPT_API_KEY.`
              }
            : {})
        };
      } catch (error) {
        return {
          name: 'auth_resolution',
          status: 'fail',
          message: error instanceof Error ? error.message : String(error),
          ...(error &&
          typeof error === 'object' &&
          'hint' in error &&
          typeof error.hint === 'string'
            ? { hint: error.hint }
            : {})
        };
      }
    }
  };
}

export function createServerConnectivityCheck(): DoctorCheck {
  return {
    name: 'server_connectivity',
    run: async (ctx) => {
      if (!ctx.resolved) {
        return undefined;
      }
      const client = ctx.createHttpClient({
        baseUrl: ctx.resolved.baseUrl,
        insecure: ctx.global.insecure,
        caCertPath: ctx.global.caCert
      });

      try {
        const devApi = await client.request<{ paths?: Record<string, unknown> }>({
          method: 'GET',
          path: '/apidoc/devapi.json'
        });
        const hasWhoami = Boolean(devApi?.paths?.['/support/user/account/whoami']);
        return {
          name: 'server_connectivity',
          status: 'pass',
          message: hasWhoami
            ? `Server reachable (${ctx.resolved.baseUrl}); /support/user/account/whoami supported`
            : `Server reachable (${ctx.resolved.baseUrl}); older version without /support/user/account/whoami`
        };
      } catch (error) {
        return {
          name: 'server_connectivity',
          status: 'warn',
          message: `Could not fetch /apidoc/devapi.json (${error instanceof Error ? error.message : String(error)})`
        };
      }
    }
  };
}

export function createIdentityProbeCheck(): DoctorCheck {
  return {
    name: 'identity_probe',
    run: async (ctx) => {
      if (!ctx.resolved?.credential) {
        return undefined;
      }
      const client = ctx.createHttpClient({
        baseUrl: ctx.resolved.baseUrl,
        insecure: ctx.global.insecure,
        caCertPath: ctx.global.caCert
      });

      try {
        const probeResult = await runWhoamiProbeChain({
          handlers: ctx.probeHandlers,
          client,
          auth: {
            authType: ctx.resolved.credential.authType,
            secret: ctx.resolved.credential.secret
          }
        });
        ctx.probeResult = probeResult;
        ctx.warnings.push(...probeResult.warnings);

        const expiryHints: string[] = [];
        if (probeResult.detail?.authType === 'token') {
          const remainingMs = probeResult.detail.session.expiresAt - Date.now();
          if (remainingMs <= 0) {
            expiryHints.push('Session expired');
          } else if (remainingMs < SESSION_EXPIRING_SOON_MS) {
            expiryHints.push(
              `Session expires within ${Math.max(1, Math.round(remainingMs / 3_600_000))}h`
            );
          }
        } else if (probeResult.detail?.authType === 'apikey') {
          const { remainingPoints, expiredTime } = probeResult.detail.apiKey.limit;
          if (remainingPoints !== null && remainingPoints <= 0) {
            expiryHints.push('API Key quota exhausted (remainingPoints=0)');
          }
          if (expiredTime) {
            const msLeft = new Date(expiredTime).getTime() - Date.now();
            if (msLeft > 0 && msLeft < KEY_EXPIRING_SOON_MS) {
              expiryHints.push(`API Key expires at ${expiredTime}`);
            }
          }
        }

        return {
          name: 'identity_probe',
          status: expiryHints.length > 0 ? 'warn' : 'pass',
          message:
            expiryHints.length > 0
              ? `Identity verified via ${probeResult.source}; warnings: ${expiryHints.join('; ')}`
              : `Identity verified via ${probeResult.source}`
        };
      } catch (error) {
        return {
          name: 'identity_probe',
          status: 'fail',
          message: error instanceof Error ? error.message : String(error),
          ...(error &&
          typeof error === 'object' &&
          'hint' in error &&
          typeof error.hint === 'string'
            ? { hint: error.hint }
            : {})
        };
      }
    }
  };
}
