import { createHash, randomUUID } from 'node:crypto';
import {
  createSagaEngine,
  createSagaRegistry,
  type DurableSagaEngine,
  type SagaRunResult
} from '@fastgpt-sdk/durable-saga';
import {
  createBullMQSagaWakeupScheduler,
  createDurableSagaRecoveryPoller,
  createMongoDurableSagaStore,
  createRedisSagaLeaseProvider,
  initDurableSagaWorker,
  type DurableSagaRecoveryPoller
} from '../../../../../common/durableSaga';
import { getLogger, LogCategories } from '../../../../../common/logger';
import type { ClientSession } from '../../../../../common/mongo';
import {
  findSandboxInstanceBySandboxId,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import {
  getSandboxArchiveImage,
  sandboxArchiveSagaDefinition,
  sandboxDeleteSagaDefinition,
  sandboxProviderMigrationSagaDefinition,
  sandboxProvisionSagaDefinition,
  sandboxRestoreSagaDefinition,
  sandboxStopSagaDefinition
} from './definitions';
import { sandboxLegacyMigrationSagaDefinition } from './legacyDefinition';
import type { FrozenLegacyMigrationGroup } from '../migration';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
const SANDBOX_SAGA_REDIS_LEASE_TTL_MS = 11 * 60_000;

type SandboxDurableSagaRuntime = {
  engine: DurableSagaEngine<ClientSession>;
  recovery: DurableSagaRecoveryPoller;
};

let runtime: SandboxDurableSagaRuntime | undefined;

const getSandboxStopSagaId = (resource: SandboxResourceDoc) =>
  `sandbox-stop-${createHash('sha256')
    .update(`${resource.sandboxId}\n${resource.lastActiveAt.toISOString()}`)
    .digest('hex')}`;

const getSandboxArchiveSagaId = (resource: SandboxResourceDoc) =>
  `sandbox-archive-${createHash('sha256')
    .update(`${resource.sandboxId}\n${resource.lastActiveAt.toISOString()}`)
    .digest('hex')}`;

const getSandboxDeleteSagaId = (resource: SandboxResourceDoc) =>
  `sandbox-delete-${createHash('sha256')
    .update(`${String(resource._id)}\n${resource.sandboxId}`)
    .digest('hex')}`;

const getSandboxProviderMigrationSagaId = (
  resource: SandboxResourceDoc,
  targetProvider: SandboxResourceDoc['provider']
) =>
  `sandbox-provider-migration-${createHash('sha256')
    .update(
      `${resource.sandboxId}\n${resource.provider}\n${targetProvider}\n${resource.lastActiveAt.toISOString()}`
    )
    .digest('hex')}`;

const assertSagaRunResult = (result: SagaRunResult): boolean => {
  switch (result.type) {
    case 'completed':
      return true;
    case 'terminal':
      if (result.snapshot.status === 'completed') return true;
      throw new Error(`Sandbox durable Saga ended with status ${result.snapshot.status}`);
    case 'scheduled':
    case 'busy':
    case 'notDue':
      return false;
    case 'blocked':
      throw new Error(
        `Sandbox durable Saga is blocked: ${result.snapshot.lastError?.message ?? 'unknown'}`
      );
    case 'definitionUnavailable':
      throw new Error(
        `Sandbox durable Saga definition is unavailable: ${result.snapshot.name}@${result.snapshot.version}`
      );
    case 'invalidSnapshot':
      throw new Error(`Sandbox durable Saga snapshot is invalid: ${result.error.message}`);
    case 'notFound':
    case 'staleWakeup':
      throw new Error(`Unexpected Sandbox durable Saga run result: ${result.type}`);
    default: {
      const exhaustive: never = result;
      throw new Error(`Unsupported Sandbox durable Saga result: ${String(exhaustive)}`);
    }
  }
};

const requireSagaRunResult = (result: SagaRunResult | undefined): SagaRunResult => {
  if (!result) throw new Error('Sandbox durable Saga did not return a run result');
  return result;
};

const requireCompletedRunResult = (result: SagaRunResult | undefined) => {
  const required = requireSagaRunResult(result);
  if (!assertSagaRunResult(required)) {
    throw new Error(`Sandbox durable Saga is pending: ${result?.type ?? 'not-started'}`);
  }
};

const runActiveSaga = async (resource: SandboxResourceDoc, expectedType?: string) => {
  const activeSaga = resource.metadata?.activeSaga;
  if (!activeSaga || (expectedType && activeSaga.type !== expectedType)) {
    throw new Error(`Sandbox ${resource.sandboxId} has no matching active durable Saga`);
  }
  const result = await getSandboxDurableSagaRuntime().engine.run(activeSaga.sagaId);
  return { completed: assertSagaRunResult(result), result };
};

/** Lazily creates the Sandbox runtime so importing lifecycle code never opens Redis/BullMQ connections. */
const getSandboxDurableSagaRuntime = (): SandboxDurableSagaRuntime => {
  if (runtime) return runtime;
  const registry = createSagaRegistry<ClientSession>();
  registry.register(sandboxStopSagaDefinition);
  registry.register(sandboxArchiveSagaDefinition);
  registry.register(sandboxDeleteSagaDefinition);
  registry.register(sandboxProviderMigrationSagaDefinition);
  registry.register(sandboxProvisionSagaDefinition);
  registry.register(sandboxRestoreSagaDefinition);
  registry.register(sandboxLegacyMigrationSagaDefinition);
  registry.seal();
  const engine = createSagaEngine({
    store: createMongoDurableSagaStore(),
    registry,
    leaseProvider: createRedisSagaLeaseProvider({
      ttlMs: SANDBOX_SAGA_REDIS_LEASE_TTL_MS,
      label: 'sandbox-durable-saga'
    }),
    wakeupScheduler: createBullMQSagaWakeupScheduler(),
    observer: {
      async onEvent(event) {
        if (event.type === 'blocked' || event.type === 'executionLost') {
          logger.warn('Sandbox durable Saga runtime event', event);
        }
      }
    },
    heartbeatIntervalMs: 15_000,
    executionStaleMs: 2 * 60_000
  });
  runtime = {
    engine,
    recovery: createDurableSagaRecoveryPoller({ engine })
  };
  return runtime;
};

/** Starts or resumes the deterministic stop command for one durable-Saga aggregate. */
export const stopSandboxResourceWithSaga = async (resource: SandboxResourceDoc): Promise<void> => {
  if (resource.status === 'stopping') {
    const { result } = await runActiveSaga(resource, 'stop');
    requireCompletedRunResult(result);
    return;
  }
  if (resource.status !== 'running') return;
  const { engine } = getSandboxDurableSagaRuntime();
  const result = await engine.start(sandboxStopSagaDefinition, {
    sagaId: getSandboxStopSagaId(resource),
    input: {
      resourceId: String(resource._id),
      provider: resource.provider,
      sandboxId: resource.sandboxId,
      sourceType: resource.sourceType,
      sourceId: resource.sourceId,
      upstreamId: resource.metadata?.upstreamId,
      lastActiveAt: resource.lastActiveAt
    },
    run: true
  });
  requireCompletedRunResult(result.runResult);
};

/** Starts or resumes archival for the aggregate version identified by lastActiveAt. */
export const archiveSandboxResourceWithSaga = async (
  resource: SandboxResourceDoc,
  options?: { run?: boolean }
): Promise<void> => {
  if (resource.status === 'archiving') {
    const { result } = await runActiveSaga(resource, 'archive');
    requireCompletedRunResult(result);
    return;
  }
  if (resource.status !== 'running' && resource.status !== 'stopped') return;
  const { engine } = getSandboxDurableSagaRuntime();
  const result = await engine.start(sandboxArchiveSagaDefinition, {
    sagaId: getSandboxArchiveSagaId(resource),
    input: {
      resourceId: String(resource._id),
      provider: resource.provider,
      sandboxId: resource.sandboxId,
      sourceType: resource.sourceType,
      sourceId: resource.sourceId,
      upstreamId: resource.metadata?.upstreamId,
      lastActiveAt: resource.lastActiveAt,
      expectedStatus: resource.status,
      image: getSandboxArchiveImage(resource.provider)
    },
    run: options?.run ?? true
  });
  if (options?.run ?? true) requireCompletedRunResult(result.runResult);
};

/** Starts or resumes forward-only cleanup of one durable-Saga aggregate. */
export const deleteSandboxResourceWithSaga = async (
  resource: SandboxResourceDoc
): Promise<void> => {
  if (resource.metadata?.activeSaga) {
    const { completed, result } = await runActiveSaga(resource);
    if (!completed) requireCompletedRunResult(result);
    const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
    if (!current) return;
    return deleteSandboxResourceWithSaga(current);
  }
  if (
    resource.status !== 'running' &&
    resource.status !== 'stopped' &&
    resource.status !== 'archived'
  ) {
    throw new Error(
      `Sandbox ${resource.sandboxId} is ${resource.status} without an active durable Saga`
    );
  }
  const { engine } = getSandboxDurableSagaRuntime();
  const result = await engine.start(sandboxDeleteSagaDefinition, {
    sagaId: getSandboxDeleteSagaId(resource),
    input: {
      resourceId: String(resource._id),
      provider: resource.provider,
      sandboxId: resource.sandboxId,
      sourceType: resource.sourceType,
      sourceId: resource.sourceId,
      upstreamId: resource.metadata?.upstreamId,
      lastActiveAt: resource.lastActiveAt,
      expectedStatus: resource.status
    },
    run: true
  });
  requireCompletedRunResult(result.runResult);
};

/** Runs archive and provider switching as one durable reservation owner. */
export const migrateSandboxProviderWithSaga = async (params: {
  resource: SandboxResourceDoc;
  targetProvider: SandboxResourceDoc['provider'];
}): Promise<void> => {
  const { resource, targetProvider } = params;
  if (resource.metadata?.activeSaga) {
    if (resource.metadata.activeSaga.type !== 'providerMigration') {
      throw new Error(
        `Sandbox provider migration is blocked by active ${resource.metadata.activeSaga.type} Saga`
      );
    }
    const { result } = await runActiveSaga(resource, 'providerMigration');
    requireCompletedRunResult(result);
    return;
  }
  if (resource.provider === targetProvider) return;
  if (
    resource.status !== 'running' &&
    resource.status !== 'stopped' &&
    resource.status !== 'archived'
  ) {
    throw new Error(
      `Sandbox provider migration cannot proceed from unmanaged ${resource.status} state`
    );
  }
  const { engine } = getSandboxDurableSagaRuntime();
  const result = await engine.start(sandboxProviderMigrationSagaDefinition, {
    sagaId: getSandboxProviderMigrationSagaId(resource, targetProvider),
    input: {
      resourceId: String(resource._id),
      provider: resource.provider,
      targetProvider,
      sandboxId: resource.sandboxId,
      sourceType: resource.sourceType,
      sourceId: resource.sourceId,
      upstreamId: resource.metadata?.upstreamId,
      lastActiveAt: resource.lastActiveAt,
      expectedStatus: resource.status,
      targetImage: getSandboxArchiveImage(targetProvider)
    },
    run: true
  });
  requireCompletedRunResult(result.runResult);
};

/** Starts a new durable aggregate or resumes an existing durable stopped aggregate. */
export const provisionSandboxWithSaga = async (params: {
  provider: SandboxResourceDoc['provider'];
  sandboxId: string;
  sourceType: SandboxResourceDoc['sourceType'];
  sourceId: string;
  userId: string;
  resumeExisting: boolean;
  storage?: NonNullable<SandboxResourceDoc['storage']>;
  limit?: Partial<NonNullable<SandboxResourceDoc['limit']>>;
  vmConfig?: import('../../infrastructure/volume/service').VolumeManagerResult;
  createConfig?: import('@fastgpt-sdk/sandbox-adapter').SandboxCreateSpec;
  activeResource?: SandboxResourceDoc;
}): Promise<boolean> => {
  if (params.activeResource?.status === 'provisioning') {
    const { completed } = await runActiveSaga(params.activeResource, 'provision');
    return completed;
  }
  const { engine } = getSandboxDurableSagaRuntime();
  const result = await engine.start(sandboxProvisionSagaDefinition, {
    sagaId: `sandbox-provision-${randomUUID()}`,
    input: {
      provider: params.provider,
      sandboxId: params.sandboxId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      resumeExisting: params.resumeExisting,
      storage: params.storage,
      limit: params.limit,
      vmConfig: params.vmConfig,
      createConfig: params.createConfig,
      upstreamId: params.activeResource?.metadata?.upstreamId,
      commandAt: new Date()
    },
    run: true
  });
  return assertSagaRunResult(requireSagaRunResult(result.runResult));
};

/** Starts or resumes restoration; a durable queue checkpoint schedules post-install S3 cleanup. */
export const restoreSandboxWithSaga = async (params: {
  resource: SandboxResourceDoc;
  provider: SandboxResourceDoc['provider'];
  sourceType: SandboxResourceDoc['sourceType'];
  sourceId: string;
  userId: string;
  storage?: NonNullable<SandboxResourceDoc['storage']>;
  limit?: Partial<NonNullable<SandboxResourceDoc['limit']>>;
  vmConfig?: import('../../infrastructure/volume/service').VolumeManagerResult | null;
  createConfig?: import('@fastgpt-sdk/sandbox-adapter').SandboxCreateSpec;
}): Promise<boolean> => {
  const { resource } = params;
  const { engine } = getSandboxDurableSagaRuntime();
  if (resource.status === 'restoring' && resource.metadata?.activeSaga?.type === 'restore') {
    const result = await engine.run(resource.metadata.activeSaga.sagaId);
    return assertSagaRunResult(result);
  }
  if (resource.status !== 'archived') return resource.status === 'running';

  const sagaId = `sandbox-restore-${createHash('sha256')
    .update(`${resource.sandboxId}\n${resource.lastActiveAt.toISOString()}`)
    .digest('hex')}`;
  const result = await engine.start(sandboxRestoreSagaDefinition, {
    sagaId,
    input: {
      resourceId: String(resource._id),
      provider: params.provider,
      sandboxId: resource.sandboxId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      upstreamId: resource.metadata?.upstreamId,
      lastActiveAt: resource.lastActiveAt,
      storage: params.storage,
      limit: params.limit,
      vmConfig: params.vmConfig,
      createConfig: params.createConfig
    },
    run: true
  });
  return assertSagaRunResult(requireSagaRunResult(result.runResult));
};

/** Dispatches one immutable Legacy group and reports whether it reached a terminal checkpoint now. */
export const migrateFrozenLegacyGroupWithSaga = async (
  input: FrozenLegacyMigrationGroup
): Promise<{ completed: boolean; migratedCount: number }> => {
  const { engine } = getSandboxDurableSagaRuntime();
  const result = await engine.start(sandboxLegacyMigrationSagaDefinition, {
    sagaId: input.targetSagaId,
    input,
    run: true
  });
  const completed = assertSagaRunResult(requireSagaRunResult(result.runResult));
  const snapshot =
    result.runResult && 'snapshot' in result.runResult
      ? result.runResult.snapshot
      : result.snapshot;
  const state = snapshot.state as { migratedCount?: number };
  return { completed, migratedCount: completed ? (state.migratedCount ?? 0) : 0 };
};

/** Returns the authoritative durable state used by an operator console or repair command. */
export const getSandboxDurableSaga = (sagaId: string) =>
  getSandboxDurableSagaRuntime().engine.get(sagaId);

/** Starts the BullMQ wake-up worker and Mongo polling fallback for registered Sandbox definitions. */
export const initSandboxDurableSagaRuntime = async () => {
  const { engine, recovery } = getSandboxDurableSagaRuntime();
  recovery.start();
  return initDurableSagaWorker({ engine });
};
