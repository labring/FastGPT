import {
  SealosDevboxAdapter,
  type SealosDevboxConfig,
  type SealosDevboxCreateConfig
} from './sealos-devbox';
import {
  OpenSandboxAdapter,
  type OpenSandboxConfigType,
  type OpenSandboxConnectionConfig
} from './opensandbox';
import type { ISandbox } from '@/contracts';

export { SealosDevboxAdapter } from './sealos-devbox';
export type { SealosDevboxConfig, SealosDevboxCreateConfig } from './sealos-devbox';
export { OpenSandboxAdapter } from './opensandbox';
export { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from './opensandbox';
export type {
  OpenSandboxConfigType,
  OpenSandboxConnectionConfig,
  SandboxRuntimeType
} from './opensandbox';
export { BaseSandboxAdapter } from './base';
export type { Volume as OpenSandboxVolume } from '@alibaba-group/opensandbox';

export type SandboxProviderType = 'opensandbox' | 'sealosdevbox';

/** Provider-specific factory input. Unsupported create fields cannot cross this boundary. */
export type SandboxFactoryConfig =
  | {
      provider: 'opensandbox';
      connectionConfig: OpenSandboxConnectionConfig;
      createConfig?: OpenSandboxConfigType;
    }
  | {
      provider: 'sealosdevbox';
      connectionConfig: SealosDevboxConfig;
      createConfig?: SealosDevboxCreateConfig;
    };

/**
 * Create a sandbox provider instance from a provider-specific connection and create config.
 */
export function createSandbox(config: SandboxFactoryConfig): ISandbox {
  switch (config.provider) {
    case 'opensandbox':
      return new OpenSandboxAdapter(config.connectionConfig, config.createConfig);

    case 'sealosdevbox':
      return new SealosDevboxAdapter(config.connectionConfig, config.createConfig);

    default:
      throw new Error('Unknown sandbox provider');
  }
}
