import {
  bindSaga,
  defineSaga,
  defineStep,
  SagaConflictError,
  type BoundSaga
} from '@fastgpt-sdk/durable-saga';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ClientSession } from '../../../../../common/mongo';
import { MongoSandboxInstance } from '../../infrastructure/instance/schema';
import {
  SandboxInstanceStatusEnum,
  SandboxLifecycleTypeEnum,
  SandboxLimitSchema,
  SandboxMetadataSchema,
  SandboxProviderSchema,
  SandboxStorageSchema
} from '../../type';
import { assertSandboxSourceActive } from '../sourceGuard';
import { runFrozenLegacyMigrationGroup, type FrozenLegacyMigrationGroup } from '../migration';
import z from 'zod';

const FrozenLegacyMigrationGroupSchema = z.object({
  kind: z.enum(['app', 'skill']),
  sourceId: z.string().min(1),
  userId: z.string().optional(),
  targetSandboxId: z.string().min(1),
  targetSagaId: z.string().min(1),
  manifestHash: z.string().min(1),
  provider: SandboxProviderSchema,
  targetMetadata: SandboxMetadataSchema,
  limit: SandboxLimitSchema.optional(),
  records: z.array(
    z.object({
      recordId: z.string().min(1),
      sandboxId: z.string().min(1),
      chatId: z.string().optional()
    })
  )
});

const LegacyMigrationOutputSchema = z.object({
  migratedCount: z.number().int().nonnegative(),
  storage: SandboxStorageSchema.optional(),
  upstreamId: z.string().min(1)
});
const LegacyMigrationStateSchema = z.object({
  migratedCount: z.number().int().nonnegative(),
  storage: SandboxStorageSchema.optional(),
  upstreamId: z.string().min(1).optional()
});

const sourceTypeFor = (input: FrozenLegacyMigrationGroup) =>
  input.kind === 'app' ? ChatSourceTypeEnum.app : ChatSourceTypeEnum.skillEdit;
const userIdFor = (input: FrozenLegacyMigrationGroup) =>
  input.kind === 'app' ? (input.userId ?? '') : ChatSourceTypeEnum.skillEdit;
const reservationKeys = (input: FrozenLegacyMigrationGroup) => [
  `agent-sandbox:source:${sourceTypeFor(input)}:${input.sourceId}`,
  `agent-sandbox:lifecycle:${input.targetSandboxId}`
];

const migrateFrozenGroupStep = defineStep<
  FrozenLegacyMigrationGroup,
  z.infer<typeof LegacyMigrationStateSchema>,
  z.infer<typeof LegacyMigrationOutputSchema>,
  ClientSession
>({
  id: 'frozen-records-migrated',
  output: LegacyMigrationOutputSchema,
  effect: { type: 'idempotent' },
  retry: {
    maxAttempts: 3,
    initialIntervalMs: 60_000,
    backoffCoefficient: 2,
    maxIntervalMs: 30 * 60_000
  },
  timeoutMs: 6 * 60 * 60_000,
  execute: async (runtime) => {
    if (runtime.input.targetSagaId !== runtime.sagaId) {
      throw new SagaConflictError('Frozen Legacy targetSagaId does not match runtime Saga ID');
    }
    return runFrozenLegacyMigrationGroup(runtime.input, runtime.assertExecutionActive);
  },
  apply: ({ state, output }) => ({ ...state, ...output })
});

/**
 * Legacy group migration owns the target aggregate from initialization through final publication.
 * Per-record Legacy phases remain idempotency checkpoints for archive, install and cleanup effects.
 */
export const sandboxLegacyMigrationSagaDefinition: BoundSaga<
  FrozenLegacyMigrationGroup,
  z.infer<typeof LegacyMigrationStateSchema>,
  ClientSession
> = bindSaga(
  defineSaga({
    name: 'sandbox.legacy-group-migration',
    version: 1,
    input: FrozenLegacyMigrationGroupSchema,
    state: LegacyMigrationStateSchema,
    initialState: (): z.infer<typeof LegacyMigrationStateSchema> => ({ migratedCount: 0 }),
    reservationKeys,
    executionLeaseKeys: (input) => [`agent-sandbox:lifecycle:${input.targetSandboxId}`],
    steps: [migrateFrozenGroupStep]
  }),
  {
    initialize: async ({ transaction, sagaId, input, now }) => {
      const sourceType = sourceTypeFor(input);
      await assertSandboxSourceActive({
        sourceType,
        sourceId: input.sourceId,
        session: transaction
      });
      const existing = await MongoSandboxInstance.findOne({
        sourceType,
        sourceId: input.sourceId,
        userId: userIdFor(input)
      })
        .session(transaction)
        .lean();
      if (existing) {
        throw new SagaConflictError('Legacy migration target aggregate already exists');
      }
      await MongoSandboxInstance.create(
        [
          {
            provider: input.provider,
            sandboxId: input.targetSandboxId,
            sourceType,
            sourceId: input.sourceId,
            userId: userIdFor(input),
            status: SandboxInstanceStatusEnum.legacyMigrating,
            lastActiveAt: now,
            createdAt: now,
            limit: input.limit,
            metadata: {
              ...input.targetMetadata,
              activeSaga: { sagaId, type: SandboxLifecycleTypeEnum.legacyMigration }
            }
          }
        ],
        { session: transaction }
      );
    },
    onComplete: async ({ transaction, sagaId, input, state, now }) => {
      if (!state.upstreamId) {
        throw new Error('Legacy migration terminal hook requires the Provider checkpoint');
      }
      const published = await MongoSandboxInstance.updateOne(
        {
          sandboxId: input.targetSandboxId,
          status: SandboxInstanceStatusEnum.legacyMigrating,
          'metadata.activeSaga.sagaId': sagaId
        },
        {
          $set: {
            status: SandboxInstanceStatusEnum.running,
            lastActiveAt: now,
            ...(input.limit ? { limit: input.limit } : {}),
            ...(state.storage ? { storage: state.storage } : {}),
            'metadata.volumeEnabled': Boolean(state.storage),
            'metadata.upstreamId': state.upstreamId
          },
          $unset: { 'metadata.activeSaga': '' }
        },
        { session: transaction }
      );
      if (published.modifiedCount !== 1) {
        throw new SagaConflictError('Legacy migration target lost ownership before publish');
      }
    }
  }
);
