import type { SandboxEnsureRunningOptions, SandboxId, SandboxInfo, SandboxStatus } from '../types';

/** Lifecycle contract shared by sandbox providers. */
export type ISandboxLifecycle = {
  readonly id?: SandboxId;
  readonly status: SandboxStatus;

  ensureRunning(options?: SandboxEnsureRunningOptions): Promise<void>;
  create(): Promise<void>;
  start(): Promise<void>;

  /** Apply the provider stop policy. OpenSandbox deletes the resource; Sealos pauses it. */
  stop(): Promise<void>;

  /** Permanently delete the remote sandbox. */
  delete(sandboxId?: SandboxId): Promise<void>;

  getInfo(): Promise<SandboxInfo | null>;
  waitUntilReady(timeoutMs?: number): Promise<void>;
  waitUntilDeleted(timeoutMs?: number): Promise<void>;

  /** Set the provider expiration to the given number of seconds from now. */
  renewExpiration(timeoutSeconds: number): Promise<void>;

  /** Release local transports without changing the remote sandbox lifecycle. */
  close(): Promise<void>;
};
