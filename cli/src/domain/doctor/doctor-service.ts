import type { ConfigRepository } from '../../infra/config/config-repository';
import type { HttpClientFactory } from '../../infra/http/fastgpt-http-client';
import type { SecretStore } from '../../infra/secrets/types';
import type { CliResult, GlobalCliOptions } from '../../shared/types';
import type {
  DoctorAuthPort,
  DoctorCheck,
  DoctorCheckResult,
  DoctorRunContext
} from './checks/doctor-check';

export type DoctorService = {
  runDiagnostics: (params: { global: GlobalCliOptions }) => Promise<CliResult>;
};

/**
 * 诊断服务：按顺序执行可插拔的 DoctorCheck 管线并通过注入端口汇总健康状态与能力矩阵。
 */
export function createDoctorService({
  checks,
  configRepo,
  secretStore,
  createHttpClient,
  authPort
}: {
  checks: readonly DoctorCheck[];
  configRepo: ConfigRepository;
  secretStore: SecretStore;
  createHttpClient: HttpClientFactory;
  authPort: DoctorAuthPort;
}): DoctorService {
  return {
    runDiagnostics: async ({ global }) => {
      const ctx: DoctorRunContext = {
        global,
        configRepo,
        secretStore,
        createHttpClient,
        authPort,
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
          capabilities: authPort.summarizeCapabilities({
            probe: ctx.probeResult,
            resolved: ctx.resolved
          })
        },
        warnings: ctx.warnings
      };
    }
  };
}
