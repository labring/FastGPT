import {
  SealosDevboxAdapter,
  type SealosDevboxConfig,
  type SealosDevboxCreateConfig
} from './SealosDevboxAdapter';
import {
  OpenSandboxAdapter,
  type OpenSandboxConnectionConfig,
  type OpenSandboxConfigType
} from './OpenSandboxAdapter';
import { E2BAdapter, type E2BConfig } from './E2BAdapter';
import type { ISandbox } from '@/interfaces';

export { SealosDevboxAdapter } from './SealosDevboxAdapter';
export type { SealosDevboxConfig, SealosDevboxCreateConfig } from './SealosDevboxAdapter';
export { OpenSandboxAdapter } from './OpenSandboxAdapter';
export type { OpenSandboxConfigType, OpenSandboxConnectionConfig } from './OpenSandboxAdapter';
export type { Volume as OpenSandboxVolume } from '@alibaba-group/opensandbox';
export { E2BAdapter } from './E2BAdapter';
export type { E2BConfig } from './E2BAdapter';

export type SandboxProviderType = 'opensandbox' | 'sealosdevbox' | 'e2b';

/** Maps each provider name to the ISandbox config type it exposes. */
interface SandboxConfigMap {
  opensandbox: OpenSandboxConfigType;
  sealosdevbox: SealosDevboxCreateConfig;
  e2b: undefined;
}

/** Resolves the concrete ISandbox type for a given provider. */

/** Maps each provider name to its constructor (connection) config type. */
interface SandboxConnectionConfig {
  opensandbox: OpenSandboxConnectionConfig;
  sealosdevbox: SealosDevboxConfig;
  e2b: E2BConfig;
}

/**
 * Create a sandbox provider instance.
 * The return type is inferred from the provider name.
 *
 * @param config Provider configuration
 * @returns Configured sandbox instance
 * @throws Error if provider type is unknown
 */
export function createSandbox<P extends SandboxProviderType>(
  provider: P,
  config: SandboxConnectionConfig[P],
  createConfig?: SandboxConfigMap[P]
): ISandbox {
  switch (provider) {
    case 'opensandbox':
      return new OpenSandboxAdapter(
        config as OpenSandboxConnectionConfig,
        createConfig as OpenSandboxConfigType
      );

    case 'sealosdevbox':
      return new SealosDevboxAdapter(
        config as SealosDevboxConfig,
        createConfig as SealosDevboxCreateConfig | undefined
      );

    case 'e2b':
      return new E2BAdapter(config as E2BConfig);

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
