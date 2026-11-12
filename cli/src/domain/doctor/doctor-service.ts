import type { ConfigRepository } from '../../infra/config/config-repository';
import type { SecretStore } from '../../infra/secrets/secret-store';
import type { CliResult, GlobalCliOptions } from '../../shared/types';
import type { HttpClientFactory } from '../auth/auth-service';
import { buildCapabilitySummary } from '../auth/capability';
import type { WhoamiProbeHandler } from '../auth/probe/probe-chain';
import type { DoctorCheck, DoctorCheckResult, DoctorRunContext } from './checks/doctor-check';

export type DoctorService = {
  runDiagnostics: (params: { global: GlobalCliOptions }) => Promise<CliResult>;
};

/**
 * 诊断服务：按顺序执行可插拔的 DoctorCheck 管线并汇总健康状态与能力矩阵。
 */
export function createDoctorService({
  checks,
  env,
  configRepo,
  secretStore,
  createHttpClient,
  probeHandlers
}: {
  checks: readonly DoctorCheck[];
  env: NodeJS.ProcessEnv;
  configRepo: ConfigRepository;
  secretStore: SecretStore;
  createHttpClient: HttpClientFactory;
  probeHandlers: readonly WhoamiProbeHandler[];
}): DoctorService {
  return {
    runDiagnostics: async ({ global }) => {
      const ctx: DoctorRunContext = {
        global,
        env,
        configRepo,
        secretStore,
        createHttpClient,
        probeHandlers,
        warnings: []
      };

      const results: DoctorCheckResult[] = [];
      for (const check of checks) {
        const result = await check.run(ctx);
        if (result) {
          results.push(result);
        }
      }

      const ok = results.every((item) => item.status !== 'fail');
      return {
        changed: false,
        data: {
          ok,
          checks: results,
          capabilities: buildCapabilitySummary({
            probe: ctx.probeResult,
            resolved: ctx.resolved
          })
        },
        warnings: ctx.warnings
      };
    }
  };
}
