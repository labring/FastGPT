import {
  createAuthService,
  type AuthService,
  type HttpClientFactory
} from '../domain/auth/auth-service';
import { createDatasetProbeHandler } from '../domain/auth/probe/dataset-probe';
import { createOpenApiHealthProbeHandler } from '../domain/auth/probe/openapi-health-probe';
import { createTokenLoginProbeHandler } from '../domain/auth/probe/token-login-probe';
import { createWhoamiProbeHandler } from '../domain/auth/probe/whoami-probe';
import { createApiKeyLoginStrategy } from '../domain/auth/strategies/api-key-login';
import { createPasswordLoginStrategy } from '../domain/auth/strategies/password-login';
import { createTokenLoginStrategy } from '../domain/auth/strategies/token-login';
import {
  createAuthResolutionCheck,
  createConfigCheck,
  createIdentityProbeCheck,
  createRuntimeCheck,
  createSecretStoreCheck,
  createServerConnectivityCheck
} from '../domain/doctor/checks/doctor-check';
import { createDoctorService, type DoctorService } from '../domain/doctor/doctor-service';
import { createDatasetService, type DatasetService } from '../domain/dataset/dataset-service';
import { createProfileService, type ProfileService } from '../domain/profile/profile-service';
import {
  createFileConfigRepository,
  resolveConfigDir,
  type ConfigRepository
} from '../infra/config/config-repository';
import { createFastGptHttpClient } from '../infra/http/fastgpt-http-client';
import { createDefaultSecretStore, type SecretStore } from '../infra/secrets/secret-store';
import { createTempFileCaptchaPreviewer } from '../infra/ui/captcha-preview';
import { openExternalFile } from '../infra/ui/external-opener';
import { createClackPrompter, createNonTtyPrompter, type Prompter } from '../infra/ui/prompter';
import { getCliVersion, type CliFetchFn, type CliFormat } from '../shared/types';

export type CliRuntimeDeps = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
  explicitJson?: boolean;
  format: CliFormat;
  quiet: boolean;
  fetchFn: CliFetchFn;
  secretStore?: SecretStore;
  configRepo?: ConfigRepository;
  prompter?: Prompter;
  readStdin: () => Promise<string>;
  openExternal?: (targetPath: string) => Promise<boolean>;
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

export type CliContainer = {
  readonly env: NodeJS.ProcessEnv;
  readonly configRepo: ConfigRepository;
  readonly secretStore: SecretStore;
  readonly prompter: Prompter;
  readonly createHttpClient: HttpClientFactory;
  readonly authService: AuthService;
  readonly profileService: ProfileService;
  readonly doctorService: DoctorService;
  readonly datasetService: DatasetService;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
};

/**
 * 组合根（Composition Root）：统一装配基础设施适配器、策略集合、责任链与领域服务。
 */
export function createCliContainer(deps: CliRuntimeDeps): CliContainer {
  const cliVersion = getCliVersion();
  const configDir = resolveConfigDir(deps.env);
  const configRepo = deps.configRepo ?? createFileConfigRepository({ configDir });

  const secretStore =
    deps.secretStore ??
    createDefaultSecretStore({
      configDir,
      env: deps.env,
      onFallbackWarning: (reason) => {
        if (!deps.quiet && deps.format === 'text') {
          deps.stderr(`Warning: ${reason}`);
        }
      }
    });

  const prompter =
    deps.prompter ??
    (deps.isTTY && !deps.explicitJson
      ? createClackPrompter()
      : createNonTtyPrompter(
          deps.explicitJson
            ? 'Interactive prompts are disabled when --format json is specified.'
            : undefined
        ));

  const createHttpClient: HttpClientFactory = ({
    baseUrl,
    insecure,
    caCertPath,
    onSessionRenewed
  }) =>
    createFastGptHttpClient({
      baseUrl,
      cliVersion,
      fetchFn: deps.fetchFn,
      insecure,
      caCertPath,
      onSessionRenewed
    });

  const probeHandlers = [
    createWhoamiProbeHandler(),
    createTokenLoginProbeHandler(),
    createOpenApiHealthProbeHandler(),
    createDatasetProbeHandler()
  ];

  const loginStrategies = [
    createPasswordLoginStrategy(),
    createApiKeyLoginStrategy(),
    createTokenLoginStrategy()
  ];

  const captchaPreviewer = createTempFileCaptchaPreviewer({
    openExternal: deps.openExternal ?? openExternalFile
  });

  const authService = createAuthService({
    configRepo,
    secretStore,
    createHttpClient,
    probeHandlers,
    loginStrategies,
    env: deps.env,
    prompter,
    readStdin: deps.readStdin,
    captchaPreviewer
  });

  const profileService = createProfileService({
    configRepo,
    env: deps.env
  });

  const doctorService = createDoctorService({
    checks: [
      createRuntimeCheck(),
      createConfigCheck(),
      createAuthResolutionCheck(),
      createSecretStoreCheck(),
      createServerConnectivityCheck(),
      createIdentityProbeCheck()
    ],
    env: deps.env,
    configRepo,
    secretStore,
    createHttpClient,
    probeHandlers
  });

  const datasetService = createDatasetService();

  return {
    env: deps.env,
    configRepo,
    secretStore,
    prompter,
    createHttpClient,
    authService,
    profileService,
    doctorService,
    datasetService,
    stdout: deps.stdout,
    stderr: deps.stderr
  };
}
