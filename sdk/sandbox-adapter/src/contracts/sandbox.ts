import type { Endpoint, SandboxCapabilities, SandboxEndpointSelector } from '../types';
import type { ICommandExecution } from './command';
import type { IFileSystem } from './filesystem';
import type { IHealthCheck } from './health';
import type { ISandboxLifecycle } from './lifecycle';

/** Unified sandbox contract consumed by FastGPT. */
export type ISandbox = ISandboxLifecycle &
  ICommandExecution &
  IFileSystem &
  IHealthCheck & {
    readonly provider: string;
    readonly capabilities: SandboxCapabilities;
    getEndpoint(selector: SandboxEndpointSelector): Promise<Endpoint>;
  };
