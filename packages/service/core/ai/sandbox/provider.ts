import type { SkillSandboxEndpointType } from '@fastgpt/global/core/agentSkills/type';
import {
  createSandbox,
  type ISandbox,
  type OpenSandboxAdapter,
  type OpenSandboxConfigType,
  type SandboxCreateSpec,
  type SandboxProviderType,
  type SandboxProxyTarget
} from '@fastgpt-sdk/sandbox-adapter';
import { serviceEnv } from '../../../env';

type SandboxRuntime = 'kubernetes' | 'docker';

type BaseSandboxProviderConfig = {
  provider: SandboxProviderType;
  baseUrl: string;
  runtime: SandboxRuntime;
};

export type OpenSandboxProviderConfig = BaseSandboxProviderConfig & {
  provider: 'opensandbox';
  apiKey?: string;
  useServerProxy?: boolean;
};

export type SealosDevboxProviderConfig = BaseSandboxProviderConfig & {
  provider: 'sealosdevbox';
  token: string;
};

export type SandboxProviderConfig = OpenSandboxProviderConfig | SealosDevboxProviderConfig;

export type SandboxCreateConfig = SandboxCreateSpec;

type ProviderSandboxProxyTarget = Extract<SandboxProxyTarget, { service: 'code-server' }>;
type ProviderSandboxInfo = NonNullable<Awaited<ReturnType<ISandbox['getInfo']>>>;

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

function toOpenSandboxCreateConfig(
  createConfig?: SandboxCreateConfig
): OpenSandboxConfigType | undefined {
  return createConfig as OpenSandboxConfigType | undefined;
}

export function getSandboxProviderConfig(
  provider: SandboxProviderType = serviceEnv.AGENT_SANDBOX_PROVIDER
): SandboxProviderConfig {
  const runtime = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME;

  switch (provider) {
    case 'opensandbox':
      return {
        provider,
        baseUrl: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
        apiKey: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
        runtime,
        useServerProxy: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      };

    case 'sealosdevbox':
      return {
        provider,
        baseUrl:
          serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL ??
          serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL ??
          '',
        token:
          serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN ??
          serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY ??
          '',
        runtime
      };

    case 'e2b':
      throw new Error('Sandbox provider "e2b" is not supported');

    default:
      return assertNever(provider);
  }
}

export function validateSandboxConfig(config: SandboxProviderConfig): void {
  if (!config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }

  if (!['kubernetes', 'docker'].includes(config.runtime)) {
    throw new Error(`Invalid runtime: ${config.runtime}`);
  }

  if (config.provider === 'sealosdevbox' && !config.token) {
    throw new Error('Sandbox provider token is required for sealosdevbox');
  }
}

export function buildSandboxAdapter(
  providerConfig: SandboxProviderConfig,
  props: {
    providerSandboxId: string;
    connectionSessionId?: string;
    createConfig?: SandboxCreateConfig;
  }
): ISandbox {
  switch (providerConfig.provider) {
    case 'opensandbox':
      return createSandbox(
        'opensandbox',
        {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime,
          useServerProxy: providerConfig.useServerProxy,
          replaceDockerInternalWithLocalhost:
            serviceEnv.SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST,
          sessionId: props.connectionSessionId ?? props.providerSandboxId
        },
        toOpenSandboxCreateConfig(props.createConfig)
      );

    case 'sealosdevbox': {
      if (!props.providerSandboxId) {
        throw new Error(
          'Sandbox provider "sealosdevbox" requires providerSandboxId when initializing the adapter'
        );
      }
      const connection = {
        baseUrl: providerConfig.baseUrl,
        token: providerConfig.token,
        sandboxId: props.providerSandboxId
      };

      return createSandbox('sealosdevbox', connection, props.createConfig);
    }

    default:
      return assertNever(providerConfig);
  }
}

export async function connectToProviderSandbox(
  providerConfig: SandboxProviderConfig,
  providerSandboxId: string,
  options?: {
    connectionSessionId?: string;
  }
): Promise<ISandbox> {
  const sandbox = buildSandboxAdapter(providerConfig, {
    providerSandboxId,
    connectionSessionId: options?.connectionSessionId
  });

  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).connect(providerSandboxId);
  }

  return sandbox;
}

export async function ensureConnectedProviderSandboxRunning(sandbox: ISandbox): Promise<void> {
  const info = await sandbox.getInfo();
  if (!info) {
    throw new Error('Provider sandbox not found');
  }

  if (info.status.state === 'Stopped' || info.status.state === 'Stopping') {
    await sandbox.start();
    return;
  }

  if (['Deleting', 'UnExist', 'Error'].includes(info.status.state)) {
    throw new Error(`Provider sandbox ${sandbox.id ?? info.id} is ${info.status.state}`);
  }

  await sandbox.waitUntilReady();
}

export async function connectReadyProviderSandboxByInstance(
  providerConfig: SandboxProviderConfig,
  instance: {
    sandboxId: string;
    metadata?: { providerSandboxId?: string } | null;
  }
): Promise<{
  sandbox: ISandbox;
  sandboxInfo: ProviderSandboxInfo;
}> {
  const providerSandboxId = getProviderSandboxConnectionTarget(providerConfig, instance);
  const sandbox = await connectToProviderSandbox(providerConfig, providerSandboxId);

  try {
    await ensureConnectedProviderSandboxRunning(sandbox);
    const sandboxInfo = await sandbox.getInfo();
    if (!sandboxInfo) {
      throw new Error('Provider sandbox not found');
    }
    return {
      sandbox,
      sandboxInfo
    };
  } catch (error) {
    await disconnectFromProviderSandbox(sandbox).catch(() => undefined);
    throw error;
  }
}

export function getProviderSandboxConnectionTarget(
  providerConfig: SandboxProviderConfig,
  instance: {
    sandboxId: string;
    metadata?: { providerSandboxId?: string } | null;
  }
): string {
  if (providerConfig.provider === 'opensandbox') {
    const providerSandboxId = instance.metadata?.providerSandboxId;
    if (!providerSandboxId) {
      throw new Error('Sandbox providerSandboxId missing');
    }
    return providerSandboxId;
  }

  return instance.metadata?.providerSandboxId ?? instance.sandboxId;
}

export async function disconnectFromProviderSandbox(sandbox: ISandbox): Promise<void> {
  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).close();
  }
}

export async function getProviderSandboxEndpoint(
  sandbox: ISandbox
): Promise<SkillSandboxEndpointType> {
  const endpointResolver = sandbox as unknown as {
    getEndpoint?: (selector: 'code-server') => Promise<SkillSandboxEndpointType>;
  };

  if (!endpointResolver.getEndpoint) {
    throw new Error(
      `Sandbox provider "${sandbox.provider}" does not expose endpoint capability through @fastgpt/sandbox. This edit-debug workflow currently requires opensandbox-compatible endpoint support.`
    );
  }

  const endpoint = await endpointResolver.getEndpoint('code-server');
  return {
    host: endpoint.host,
    port: endpoint.port,
    protocol: endpoint.protocol,
    url: endpoint.url
  };
}

export async function getProviderSandboxProxyTarget(
  sandbox: ISandbox
): Promise<ProviderSandboxProxyTarget> {
  const proxyResolver = sandbox as unknown as {
    getProxyTarget?: (service: 'code-server') => Promise<ProviderSandboxProxyTarget>;
  };

  if (!proxyResolver.getProxyTarget) {
    throw new Error(
      `Sandbox provider "${sandbox.provider}" does not expose proxy target capability through @fastgpt/sandbox.`
    );
  }

  return proxyResolver.getProxyTarget('code-server');
}

export async function waitForEndpointReady(
  endpoint: SkillSandboxEndpointType,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const intervalMs = options?.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetch(endpoint.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3_000)
      });
      return;
    } catch {
      // Service is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Sandbox endpoint ${endpoint.url} did not become ready within ${timeoutMs / 1000}s`
  );
}
