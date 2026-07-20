import {
  bindSaga,
  defineSaga,
  defineStep,
  SagaConflictError,
  type BoundSaga
} from '@fastgpt-sdk/durable-saga';
import type { ClientSession } from '../../../../../common/mongo';
import { MongoSandboxInstance } from '../../infrastructure/instance/schema';
import { buildSandboxResourceAdapter } from '../../infrastructure/provider/adapter';
import { buildRuntimeSandboxAdapter } from '../../infrastructure/provider/adapter';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import { getS3SandboxSource } from '../../../../../common/s3/sources/sandbox';
import { deleteSessionVolume } from '../../infrastructure/volume/service';
import type { VolumeManagerResult } from '../../infrastructure/volume/service';
import {
  disconnectSandbox,
  ensureConnectedSandboxRunning
} from '../../infrastructure/provider/lifecycle';
import type { SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import {
  deleteArchivedRemoteResource,
  inspectSandboxWorkspaceRestore,
  installSandboxWorkspaceArchive,
  uploadSandboxWorkspaceArchive
} from '../archive';
import {
  SandboxInstanceStatusEnum,
  SandboxLifecycleTypeEnum,
  SandboxLimitSchema,
  SandboxProviderSchema,
  SandboxStorageSchema,
  SandboxSourceTypeSchema
} from '../../type';
import z from 'zod';
import { assertSandboxSourceActive } from '../sourceGuard';

const SandboxStopSagaInputSchema = z.object({
  resourceId: z.string().min(1),
  provider: SandboxProviderSchema,
  sandboxId: z.string().min(1),
  sourceType: SandboxSourceTypeSchema,
  sourceId: z.string().min(1),
  upstreamId: z.string().min(1).optional(),
  lastActiveAt: z.coerce.date()
});
type SandboxStopSagaInput = z.infer<typeof SandboxStopSagaInputSchema>;

const EmptySagaStateSchema = z.object({});
const VoidOutputSchema = z.undefined();

const SandboxLifecycleResourceInputSchema = z.object({
  resourceId: z.string().min(1),
  provider: SandboxProviderSchema,
  sandboxId: z.string().min(1),
  sourceType: SandboxSourceTypeSchema,
  sourceId: z.string().min(1),
  upstreamId: z.string().min(1).optional(),
  lastActiveAt: z.coerce.date()
});

const lifecycleReservationKeys = (input: { sandboxId: string }) => [
  `agent-sandbox:lifecycle:${input.sandboxId}`
];

const sourceInitializationLeaseKeys = (input: {
  sourceType: string;
  sourceId: string;
  sandboxId: string;
}) => [
  `agent-sandbox:source:${input.sourceType}:${input.sourceId}`,
  `agent-sandbox:lifecycle:${input.sandboxId}`
];

/** Verifies that the domain aggregate still points at this Saga before a remote side effect. */
const assertSandboxSagaOwnership = async (params: {
  resourceId: string;
  sagaId: string;
  status: string;
}) => {
  const owned = await MongoSandboxInstance.exists({
    _id: params.resourceId,
    status: params.status,
    'metadata.activeSaga.sagaId': params.sagaId
  });
  if (!owned) {
    throw new SagaConflictError(`Sandbox aggregate is no longer owned by Saga "${params.sagaId}"`);
  }
};

const getOwnedSandboxResource = async (params: {
  resourceId: string;
  sagaId: string;
  status: string;
}) => {
  const resource = await MongoSandboxInstance.findOne({
    _id: params.resourceId,
    status: params.status,
    'metadata.activeSaga.sagaId': params.sagaId
  }).lean();
  if (!resource) {
    throw new SagaConflictError(`Sandbox aggregate is no longer owned by Saga "${params.sagaId}"`);
  }
  return resource;
};

const stopProviderStep = defineStep<
  SandboxStopSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'provider-stopped',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: {
    maxAttempts: 5,
    initialIntervalMs: 5_000,
    backoffCoefficient: 2,
    maxIntervalMs: 5 * 60_000
  },
  timeoutMs: 10 * 60_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.stopping
    });
    await runtime.assertExecutionActive();
    await buildSandboxResourceAdapter(runtime.input).stop();
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

/** Durable replacement for the hand-written Sandbox stop phase machine. */
export const sandboxStopSagaDefinition: BoundSaga<
  SandboxStopSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.stop',
    version: 1,
    input: SandboxStopSagaInputSchema,
    state: EmptySagaStateSchema,
    initialState: () => ({}),
    reservationKeys: lifecycleReservationKeys,
    steps: [stopProviderStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input }) => {
      const claimed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          provider: input.provider,
          sandboxId: input.sandboxId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          status: SandboxInstanceStatusEnum.running,
          lastActiveAt: input.lastActiveAt,
          'metadata.activeSaga': { $exists: false }
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.stopping,
            'metadata.activeSaga': {
              sagaId,
              type: SandboxLifecycleTypeEnum.stop
            }
          }
        },
        { session: transaction }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox stop could not claim the current running aggregate');
      }
    },
    onComplete: async ({ transaction, sagaId, input }) => {
      const completed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          status: SandboxInstanceStatusEnum.stopping,
          'metadata.activeSaga.sagaId': sagaId
        },
        {
          $set: { status: SandboxInstanceStatusEnum.stopped },
          $unset: { 'metadata.activeSaga': '' }
        },
        { session: transaction }
      );
      if (completed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox stop lost aggregate ownership before terminal commit');
      }
    }
  }
);

const SandboxArchiveSagaInputSchema = SandboxLifecycleResourceInputSchema.extend({
  expectedStatus: z.enum([SandboxInstanceStatusEnum.running, SandboxInstanceStatusEnum.stopped]),
  image: z.object({ repository: z.string(), tag: z.string().optional() }).optional()
});
type SandboxArchiveSagaInput = z.infer<typeof SandboxArchiveSagaInputSchema>;

const uploadArchiveStep = defineStep<
  SandboxArchiveSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'archive-uploaded',
  output: VoidOutputSchema,
  effect: {
    type: 'reconcileRequired',
    isolationMs: 45 * 60_000,
    reconcile: async (runtime) => {
      const idempotencyKey = await getS3SandboxSource().getWorkspaceArchiveIdempotencyKey({
        sandboxId: runtime.input.sandboxId
      });
      return idempotencyKey === runtime.idempotencyKey
        ? { type: 'applied', output: undefined }
        : { type: 'notApplied' };
    }
  },
  retry: {
    maxAttempts: 5,
    initialIntervalMs: 30_000,
    backoffCoefficient: 2,
    maxIntervalMs: 10 * 60_000
  },
  timeoutMs: 30 * 60_000,
  execute: async (runtime) => {
    const resource = await getOwnedSandboxResource({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.archiving
    });
    await runtime.assertExecutionActive();
    await uploadSandboxWorkspaceArchive({
      resource,
      idempotencyKey: runtime.idempotencyKey
    });
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

const deleteArchivedProviderStep = defineStep<
  SandboxArchiveSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'provider-deleted',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: {
    maxAttempts: 5,
    initialIntervalMs: 10_000,
    backoffCoefficient: 2,
    maxIntervalMs: 5 * 60_000
  },
  timeoutMs: 15 * 60_000,
  execute: async (runtime) => {
    const resource = await getOwnedSandboxResource({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.archiving
    });
    await runtime.assertExecutionActive();
    await deleteArchivedRemoteResource(resource);
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

/** Archives a Sandbox with exact S3-object reconciliation before deleting the Provider resource. */
export const sandboxArchiveSagaDefinition: BoundSaga<
  SandboxArchiveSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.archive',
    version: 1,
    input: SandboxArchiveSagaInputSchema,
    state: EmptySagaStateSchema,
    initialState: () => ({}),
    reservationKeys: lifecycleReservationKeys,
    steps: [uploadArchiveStep, deleteArchivedProviderStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input }) => {
      const claimed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          provider: input.provider,
          sandboxId: input.sandboxId,
          status: input.expectedStatus,
          lastActiveAt: input.lastActiveAt,
          'metadata.activeSaga': { $exists: false }
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.archiving,
            'metadata.activeSaga': {
              sagaId,
              type: SandboxLifecycleTypeEnum.archive
            }
          }
        },
        { session: transaction }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SagaConflictError(
          'Sandbox archive could not claim the expected aggregate version'
        );
      }
    },
    onComplete: async ({ transaction, sagaId, input }) => {
      const completed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          status: SandboxInstanceStatusEnum.archiving,
          'metadata.activeSaga.sagaId': sagaId
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.archived,
            ...(input.image ? { 'metadata.image': input.image } : {})
          },
          $unset: {
            'metadata.activeSaga': '',
            'metadata.upstreamId': ''
          }
        },
        { session: transaction }
      );
      if (completed.modifiedCount !== 1) {
        throw new SagaConflictError(
          'Sandbox archive lost aggregate ownership before terminal commit'
        );
      }
    }
  }
);

/** Resolves the runtime image before entering a transaction callback. */
export const getSandboxArchiveImage = (provider: z.infer<typeof SandboxProviderSchema>) =>
  getSandboxRuntimeProfile(provider).defaultImage;

const SandboxDeleteSagaInputSchema = SandboxLifecycleResourceInputSchema.extend({
  expectedStatus: z.enum([
    SandboxInstanceStatusEnum.running,
    SandboxInstanceStatusEnum.stopped,
    SandboxInstanceStatusEnum.archived
  ])
});
type SandboxDeleteSagaInput = z.infer<typeof SandboxDeleteSagaInputSchema>;

const deleteProviderStep = defineStep<
  SandboxDeleteSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'provider-deleted',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 5, initialIntervalMs: 10_000, maxIntervalMs: 5 * 60_000 },
  timeoutMs: 15 * 60_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.deleting
    });
    await runtime.assertExecutionActive();
    await buildSandboxResourceAdapter(runtime.input).delete();
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

const deleteVolumeStep = defineStep<
  SandboxDeleteSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'volume-deleted',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 5, initialIntervalMs: 10_000, maxIntervalMs: 5 * 60_000 },
  timeoutMs: 5 * 60_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.deleting
    });
    await runtime.assertExecutionActive();
    if (runtime.input.provider === 'opensandbox') {
      await deleteSessionVolume(runtime.input.sandboxId);
    }
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

const scheduleArchiveDeleteStep = defineStep<
  SandboxDeleteSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'archive-delete-scheduled',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 5, initialIntervalMs: 5_000, maxIntervalMs: 60_000 },
  timeoutMs: 60_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.deleting
    });
    await runtime.assertExecutionActive();
    await getS3SandboxSource().deleteWorkspaceArchive({ sandboxId: runtime.input.sandboxId });
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

/** Deletes all external resources before transactionally removing the Sandbox aggregate record. */
export const sandboxDeleteSagaDefinition: BoundSaga<
  SandboxDeleteSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.delete',
    version: 1,
    input: SandboxDeleteSagaInputSchema,
    state: EmptySagaStateSchema,
    initialState: () => ({}),
    reservationKeys: lifecycleReservationKeys,
    steps: [deleteProviderStep, deleteVolumeStep, scheduleArchiveDeleteStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input }) => {
      const claimed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          provider: input.provider,
          sandboxId: input.sandboxId,
          status: input.expectedStatus,
          'metadata.activeSaga': { $exists: false }
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.deleting,
            'metadata.activeSaga': {
              sagaId,
              type: SandboxLifecycleTypeEnum.delete
            }
          }
        },
        { session: transaction }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox delete could not claim the expected aggregate state');
      }
    },
    onComplete: async ({ transaction, sagaId, input }) => {
      const deleted = await MongoSandboxInstance.deleteOne(
        {
          _id: input.resourceId,
          status: SandboxInstanceStatusEnum.deleting,
          'metadata.activeSaga.sagaId': sagaId
        },
        { session: transaction }
      );
      if (deleted.deletedCount !== 1) {
        throw new SagaConflictError(
          'Sandbox delete lost aggregate ownership before record removal'
        );
      }
    }
  }
);

const SandboxProviderMigrationSagaInputSchema = SandboxLifecycleResourceInputSchema.extend({
  targetProvider: SandboxProviderSchema,
  expectedStatus: z.enum([
    SandboxInstanceStatusEnum.running,
    SandboxInstanceStatusEnum.stopped,
    SandboxInstanceStatusEnum.archived
  ]),
  targetImage: z.object({ repository: z.string(), tag: z.string().optional() }).optional()
});
type SandboxProviderMigrationSagaInput = z.infer<typeof SandboxProviderMigrationSagaInputSchema>;

const uploadMigrationArchiveStep = defineStep<
  SandboxProviderMigrationSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'archive-uploaded',
  output: VoidOutputSchema,
  when: ({ input }) => input.expectedStatus !== SandboxInstanceStatusEnum.archived,
  effect: {
    type: 'reconcileRequired',
    isolationMs: 45 * 60_000,
    reconcile: async (runtime) => {
      const idempotencyKey = await getS3SandboxSource().getWorkspaceArchiveIdempotencyKey({
        sandboxId: runtime.input.sandboxId
      });
      return idempotencyKey === runtime.idempotencyKey
        ? { type: 'applied', output: undefined }
        : { type: 'notApplied' };
    }
  },
  retry: { maxAttempts: 5, initialIntervalMs: 30_000, maxIntervalMs: 10 * 60_000 },
  timeoutMs: 30 * 60_000,
  execute: async (runtime) => {
    const resource = await getOwnedSandboxResource({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.providerMigrating
    });
    await runtime.assertExecutionActive();
    await uploadSandboxWorkspaceArchive({
      resource,
      idempotencyKey: runtime.idempotencyKey
    });
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

const deleteMigrationSourceStep = defineStep<
  SandboxProviderMigrationSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'source-provider-deleted',
  output: VoidOutputSchema,
  when: ({ input }) => input.expectedStatus !== SandboxInstanceStatusEnum.archived,
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 5, initialIntervalMs: 10_000, maxIntervalMs: 5 * 60_000 },
  timeoutMs: 15 * 60_000,
  execute: async (runtime) => {
    const resource = await getOwnedSandboxResource({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.providerMigrating
    });
    await runtime.assertExecutionActive();
    await deleteArchivedRemoteResource(resource);
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

const validateMigrationTargetStep = defineStep<
  SandboxProviderMigrationSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'target-validated',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 1, initialIntervalMs: 0 },
  timeoutMs: 30_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.providerMigrating
    });
    buildSandboxResourceAdapter({
      provider: runtime.input.targetProvider,
      sandboxId: runtime.input.sandboxId
    });
    return undefined;
  },
  apply: ({ state }) => state
});

/** Keeps archive and provider switching under one reservation ownership interval. */
export const sandboxProviderMigrationSagaDefinition: BoundSaga<
  SandboxProviderMigrationSagaInput,
  z.infer<typeof EmptySagaStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.provider-migration',
    version: 1,
    input: SandboxProviderMigrationSagaInputSchema,
    state: EmptySagaStateSchema,
    initialState: () => ({}),
    reservationKeys: lifecycleReservationKeys,
    initializationLeaseKeys: sourceInitializationLeaseKeys,
    steps: [validateMigrationTargetStep, uploadMigrationArchiveStep, deleteMigrationSourceStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input }) => {
      await assertSandboxSourceActive({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        session: transaction
      });
      if (input.provider === input.targetProvider) {
        throw new SagaConflictError('Sandbox provider migration target equals current provider');
      }
      const claimed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          provider: input.provider,
          sandboxId: input.sandboxId,
          status: input.expectedStatus,
          lastActiveAt: input.lastActiveAt,
          'metadata.activeSaga': { $exists: false }
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.providerMigrating,
            'metadata.activeSaga': {
              sagaId,
              type: SandboxLifecycleTypeEnum.providerMigration
            }
          }
        },
        { session: transaction }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox provider migration could not claim the aggregate');
      }
    },
    onComplete: async ({ transaction, sagaId, input }) => {
      const completed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          provider: input.provider,
          status: SandboxInstanceStatusEnum.providerMigrating,
          'metadata.activeSaga.sagaId': sagaId
        },
        {
          $set: {
            provider: input.targetProvider,
            status: SandboxInstanceStatusEnum.archived,
            lastActiveAt: input.lastActiveAt,
            ...(input.targetImage ? { 'metadata.image': input.targetImage } : {})
          },
          $unset: {
            'metadata.activeSaga': '',
            'metadata.upstreamId': ''
          }
        },
        { session: transaction }
      );
      if (completed.modifiedCount !== 1) {
        throw new SagaConflictError(
          'Sandbox provider migration lost ownership before provider CAS'
        );
      }
    }
  }
);

const SandboxProvisionSagaInputSchema = SandboxLifecycleResourceInputSchema.omit({
  resourceId: true,
  lastActiveAt: true
}).extend({
  userId: z.string().min(1),
  commandAt: z.coerce.date(),
  resumeExisting: z.boolean(),
  storage: SandboxStorageSchema.optional(),
  limit: SandboxLimitSchema.partial().optional(),
  vmConfig: z.custom<VolumeManagerResult>().optional(),
  createConfig: z.custom<SandboxCreateSpec>().optional()
});
type SandboxProvisionSagaInput = z.infer<typeof SandboxProvisionSagaInputSchema>;

const ProviderEnsuredOutputSchema = z.object({
  upstreamId: z.string().min(1)
});

const SandboxProvisionSagaStateSchema = z.object({
  upstreamId: z.string().min(1).nullable()
});

const buildDurableCreateConfig = (
  input: SandboxProvisionSagaInput,
  idempotencyKey: string
): SandboxCreateSpec => ({
  ...input.createConfig,
  metadata: {
    ...input.createConfig?.metadata,
    durableSagaIdempotencyKey: idempotencyKey
  }
});

const buildProvisionAdapter = (input: SandboxProvisionSagaInput, idempotencyKey: string) =>
  buildRuntimeSandboxAdapter(input.provider, input.sandboxId, {
    upstreamId: input.upstreamId,
    resourceLimits: input.limit,
    vmConfig: input.vmConfig,
    createConfig: buildDurableCreateConfig(input, idempotencyKey)
  });

const ensureProviderStep = defineStep<
  SandboxProvisionSagaInput,
  z.infer<typeof SandboxProvisionSagaStateSchema>,
  z.infer<typeof ProviderEnsuredOutputSchema>,
  ClientSession
>({
  id: 'provider-ensured',
  output: ProviderEnsuredOutputSchema,
  effect: {
    type: 'reconcileRequired',
    isolationMs: 15 * 60_000,
    reconcile: async (runtime) => {
      const sandbox = buildProvisionAdapter(runtime.input, runtime.idempotencyKey);
      try {
        const info = await sandbox.getInfo();
        if (!info) return { type: 'notApplied' };
        const marker = info.metadata?.durableSagaIdempotencyKey;
        if (
          runtime.input.provider === 'opensandbox' &&
          !runtime.input.resumeExisting &&
          marker !== runtime.idempotencyKey
        ) {
          throw new SagaConflictError(
            `OpenSandbox session "${runtime.input.sandboxId}" exists with a different idempotency key`
          );
        }
        if (info.status.state !== 'Running') return { type: 'notApplied' };
        return { type: 'applied', output: { upstreamId: info.id } };
      } finally {
        await disconnectSandbox(sandbox).catch(() => undefined);
      }
    }
  },
  retry: { maxAttempts: 5, initialIntervalMs: 10_000, maxIntervalMs: 5 * 60_000 },
  timeoutMs: 15 * 60_000,
  execute: async (runtime) => {
    const owned = await MongoSandboxInstance.exists({
      sourceType: runtime.input.sourceType,
      sourceId: runtime.input.sourceId,
      userId: runtime.input.userId,
      status: SandboxInstanceStatusEnum.provisioning,
      'metadata.activeSaga.sagaId': runtime.sagaId
    });
    if (!owned) throw new SagaConflictError('Sandbox provisioning lost aggregate ownership');

    const sandbox = buildProvisionAdapter(runtime.input, runtime.idempotencyKey);
    try {
      await runtime.assertExecutionActive();
      await ensureConnectedSandboxRunning(sandbox);
      const info = await sandbox.getInfo();
      await runtime.assertExecutionActive();
      const upstreamId = info?.id ?? sandbox.id;
      if (!upstreamId) throw new SagaConflictError('Sandbox Provider returned no upstream ID');
      return { upstreamId };
    } finally {
      await disconnectSandbox(sandbox).catch(() => undefined);
    }
  },
  apply: ({ state, output }) => ({
    ...state,
    upstreamId: output.upstreamId
  })
});

/** Creates/resumes a Provider resource and publishes the local running record only after checkpoint. */
export const sandboxProvisionSagaDefinition: BoundSaga<
  SandboxProvisionSagaInput,
  z.infer<typeof SandboxProvisionSagaStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.provision',
    version: 1,
    input: SandboxProvisionSagaInputSchema,
    state: SandboxProvisionSagaStateSchema,
    initialState: (input) => ({ upstreamId: input.upstreamId ?? null }),
    reservationKeys: lifecycleReservationKeys,
    initializationLeaseKeys: sourceInitializationLeaseKeys,
    steps: [ensureProviderStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input }) => {
      await assertSandboxSourceActive({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        session: transaction
      });
      const existing = await MongoSandboxInstance.findOne({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        userId: input.userId
      })
        .session(transaction)
        .lean();

      if (!existing) {
        if (input.resumeExisting) {
          throw new SagaConflictError(
            'Sandbox provisioning expected an existing stopped aggregate'
          );
        }
        await MongoSandboxInstance.create(
          [
            {
              provider: input.provider,
              sandboxId: input.sandboxId,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              userId: input.userId,
              status: SandboxInstanceStatusEnum.provisioning,
              lastActiveAt: input.commandAt,
              createdAt: input.commandAt,
              storage: input.storage,
              limit: input.limit,
              metadata: {
                volumeEnabled: Boolean(input.storage),
                activeSaga: {
                  sagaId,
                  type: SandboxLifecycleTypeEnum.provision
                }
              }
            }
          ],
          { session: transaction }
        );
        return;
      }

      if (
        !input.resumeExisting ||
        existing.provider !== input.provider ||
        existing.sandboxId !== input.sandboxId ||
        existing.status !== SandboxInstanceStatusEnum.stopped
      ) {
        throw new SagaConflictError('Sandbox provisioning cannot claim the existing aggregate');
      }
      const claimed = await MongoSandboxInstance.updateOne(
        {
          _id: existing._id,
          status: SandboxInstanceStatusEnum.stopped,
          'metadata.activeSaga': { $exists: false }
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.provisioning,
            'metadata.activeSaga': {
              sagaId,
              type: SandboxLifecycleTypeEnum.provision
            }
          }
        },
        { session: transaction }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox provisioning lost the stopped aggregate claim');
      }
    },
    onComplete: async ({ transaction, sagaId, input, state }) => {
      if (!state.upstreamId) {
        throw new SagaConflictError('Sandbox provisioning completed without an upstream ID');
      }
      const completed = await MongoSandboxInstance.updateOne(
        {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          userId: input.userId,
          status: SandboxInstanceStatusEnum.provisioning,
          'metadata.activeSaga.sagaId': sagaId
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.running,
            lastActiveAt: input.commandAt,
            ...(input.storage ? { storage: input.storage } : {}),
            ...(input.limit ? { limit: input.limit } : {}),
            'metadata.volumeEnabled': Boolean(input.storage),
            'metadata.upstreamId': state.upstreamId
          },
          $unset: { 'metadata.activeSaga': '' }
        },
        { session: transaction }
      );
      if (completed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox provisioning lost ownership before running publish');
      }
    }
  }
);

const SandboxRestoreSagaInputSchema = SandboxLifecycleResourceInputSchema.extend({
  userId: z.string().min(1),
  storage: SandboxStorageSchema.optional(),
  limit: SandboxLimitSchema.partial().optional(),
  vmConfig: z.custom<VolumeManagerResult | null>().optional(),
  createConfig: z.custom<SandboxCreateSpec>().optional()
});
type SandboxRestoreSagaInput = z.infer<typeof SandboxRestoreSagaInputSchema>;

const RestoreInstalledOutputSchema = z.object({
  upstreamId: z.string().min(1),
  storage: SandboxStorageSchema.optional()
});

const SandboxRestoreSagaStateSchema = z.object({
  upstreamId: z.string().min(1).nullable(),
  storage: SandboxStorageSchema.optional()
});

const installRestoreArchiveStep = defineStep<
  SandboxRestoreSagaInput,
  z.infer<typeof SandboxRestoreSagaStateSchema>,
  z.infer<typeof RestoreInstalledOutputSchema>,
  ClientSession
>({
  id: 'archive-installed',
  output: RestoreInstalledOutputSchema,
  effect: {
    type: 'reconcileRequired',
    isolationMs: 45 * 60_000,
    reconcile: async (runtime) => {
      const inspected = await inspectSandboxWorkspaceRestore({
        provider: runtime.input.provider,
        sandboxId: runtime.input.sandboxId,
        idempotencyKey: runtime.idempotencyKey,
        vmConfig: runtime.input.vmConfig,
        createConfig: runtime.input.createConfig
      });
      return inspected.applied
        ? {
            type: 'applied',
            output: {
              upstreamId: inspected.upstreamId,
              storage: runtime.input.storage
            }
          }
        : { type: 'notApplied' };
    }
  },
  retry: { maxAttempts: 5, initialIntervalMs: 30_000, maxIntervalMs: 10 * 60_000 },
  timeoutMs: 30 * 60_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.restoring
    });
    await runtime.assertExecutionActive();
    const restored = await installSandboxWorkspaceArchive({
      provider: runtime.input.provider,
      sandboxId: runtime.input.sandboxId,
      idempotencyKey: runtime.idempotencyKey,
      vmConfig: runtime.input.vmConfig,
      createConfig: runtime.input.createConfig
    });
    await runtime.assertExecutionActive();
    return {
      upstreamId: restored.upstreamId,
      storage: runtime.input.storage ?? restored.storage
    };
  },
  apply: ({ state, output }) => ({
    ...state,
    upstreamId: output.upstreamId,
    storage: output.storage
  })
});

const enqueueRestoreArchiveCleanupStep = defineStep<
  SandboxRestoreSagaInput,
  z.infer<typeof SandboxRestoreSagaStateSchema>,
  undefined,
  ClientSession
>({
  id: 'archive-cleanup-enqueued',
  output: VoidOutputSchema,
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 5, initialIntervalMs: 5_000, maxIntervalMs: 60_000 },
  timeoutMs: 60_000,
  execute: async (runtime) => {
    await assertSandboxSagaOwnership({
      resourceId: runtime.input.resourceId,
      sagaId: runtime.sagaId,
      status: SandboxInstanceStatusEnum.restoring
    });
    await runtime.assertExecutionActive();
    await getS3SandboxSource().deleteWorkspaceArchive({ sandboxId: runtime.input.sandboxId });
    await runtime.assertExecutionActive();
    return undefined;
  },
  apply: ({ state }) => state
});

/** Restores an archived Workspace and publishes running before asynchronous S3 cleanup. */
export const sandboxRestoreSagaDefinition: BoundSaga<
  SandboxRestoreSagaInput,
  z.infer<typeof SandboxRestoreSagaStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.restore',
    version: 1,
    input: SandboxRestoreSagaInputSchema,
    state: SandboxRestoreSagaStateSchema,
    initialState: (input) => ({
      upstreamId: input.upstreamId ?? null,
      storage: input.storage
    }),
    reservationKeys: lifecycleReservationKeys,
    initializationLeaseKeys: sourceInitializationLeaseKeys,
    steps: [installRestoreArchiveStep, enqueueRestoreArchiveCleanupStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input }) => {
      await assertSandboxSourceActive({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        session: transaction
      });
      const claimed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          status: SandboxInstanceStatusEnum.archived,
          'metadata.activeSaga': { $exists: false }
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.restoring,
            'metadata.activeSaga': {
              sagaId,
              type: SandboxLifecycleTypeEnum.restore
            }
          }
        },
        { session: transaction }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox restore could not claim the archived aggregate');
      }
    },
    onComplete: async ({ transaction, sagaId, input, state, now }) => {
      if (!state.upstreamId) {
        throw new SagaConflictError('Sandbox restore completed without an upstream ID');
      }
      const completed = await MongoSandboxInstance.updateOne(
        {
          _id: input.resourceId,
          status: SandboxInstanceStatusEnum.restoring,
          'metadata.activeSaga.sagaId': sagaId
        },
        {
          $set: {
            provider: input.provider,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            userId: input.userId,
            status: SandboxInstanceStatusEnum.running,
            lastActiveAt: now,
            ...(state.storage ? { storage: state.storage } : {}),
            ...(input.limit ? { limit: input.limit } : {}),
            'metadata.volumeEnabled': Boolean(state.storage),
            'metadata.upstreamId': state.upstreamId
          },
          $unset: { 'metadata.activeSaga': '' }
        },
        { session: transaction }
      );
      if (completed.modifiedCount !== 1) {
        throw new SagaConflictError('Sandbox restore lost ownership before running publish');
      }
    }
  }
);
