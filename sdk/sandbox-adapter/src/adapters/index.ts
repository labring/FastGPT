import { SealosDevboxAdapter, type SealosDevboxConfig } from './SealosDevboxAdapter';
import { OpenSandboxAdapter, type OpenSandboxConnectionConfig } from './OpenSandboxAdapter';
import { E2BAdapter, type E2BConfig } from './E2BAdapter';
import type { ISandbox } from '@/interfaces';
import type { SandboxCreateSpec } from '@/types';

export { SealosDevboxAdapter } from './SealosDevboxAdapter';
export type { SealosDevboxConfig } from './SealosDevboxAdapter';
export { OpenSandboxAdapter } from './OpenSandboxAdapter';
export type { OpenSandboxConfigType, OpenSandboxConnectionConfig } from './OpenSandboxAdapter';
export type { Volume as OpenSandboxVolume } from '@alibaba-group/opensandbox';
export { E2BAdapter } from './E2BAdapter';
export type { E2BConfig } from './E2BAdapter';

export type SandboxProviderType = 'opensandbox' | 'sealosdevbox' | 'e2b';

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
  createConfig?: SandboxCreateSpec
): ISandbox {
  switch (provider) {
    case 'opensandbox':
      return new OpenSandboxAdapter(config as OpenSandboxConnectionConfig, createConfig);

    case 'sealosdevbox':
      return new SealosDevboxAdapter(config as SealosDevboxConfig, createConfig);

    case 'e2b':
      return new E2BAdapter(config as E2BConfig);

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
