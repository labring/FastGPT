/**
 * 旧 Sandbox 实例集合模型。
 *
 * 该模型只供升级迁移和 Source 删除清理读取 `agent_sandbox_instances`，运行时业务必须使用新实例表。
 */
import { connectionMongo, getMongoModel } from '../../../../../common/mongo';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  SandboxLimitSchema,
  SandboxImageSchema,
  SandboxProviderSchema,
  SandboxStorageSchema,
  SharedSandboxStatusSchema
} from '../../type';
import z from 'zod';

const { Schema } = connectionMongo;

export const legacyCollectionName = 'agent_sandbox_instances';

const LegacySandboxMetadataSchema = z
  .object({
    teamId: z.string().optional(),
    tmbId: z.string().optional(),
    volumeEnabled: z.boolean().optional(),
    provider: SandboxProviderSchema.optional(),
    migration: z.enum(['migrating', 'failed']).optional(),
    archive: z
      .object({
        state: z.enum(['archiving', 'deleting', 'archived', 'restoring', 'failed']),
        startedAt: z.coerce.date().optional(),
        deleteStartedAt: z.coerce.date().optional(),
        archivedAt: z.coerce.date().optional(),
        failedAt: z.coerce.date().optional(),
        error: z.string().optional()
      })
      .optional(),
    userLevelMigration: z
      .object({
        phase: z.enum(['pending', 'archiveReady', 'installed', 'cleanupPending', 'completed']),
        targetSandboxId: z.string(),
        updatedAt: z.coerce.date()
      })
      .optional(),
    skillId: z.never().optional(),
    sessionId: z.string().optional(),
    skillIds: z.array(z.string()).optional(),
    image: SandboxImageSchema.optional(),
    skillName: z.string().optional(),
    versionId: z.string().optional()
  })
  .strip();

const LegacySandboxCommonSchema = z
  .object({
    _id: z.unknown().refine((value) => value !== null && value !== undefined, {
      message: '_id is required'
    }),
    provider: SandboxProviderSchema,
    sandboxId: z.string().min(1),
    sourceId: z.string().min(1),
    status: SharedSandboxStatusSchema,
    lastActiveAt: z.date(),
    createdAt: z.date().optional(),
    limit: SandboxLimitSchema.optional(),
    storage: SandboxStorageSchema.nullish(),
    metadata: LegacySandboxMetadataSchema.optional(),
    appId: z.never().optional(),
    type: z.never().optional()
  })
  .passthrough();

/** beta6 归一化完成后，用户级 Sandbox 迁移允许读取的 Legacy 记录结构。 */
export const LegacySandboxInstanceZodSchema = z
  .discriminatedUnion('sourceType', [
    LegacySandboxCommonSchema.extend({
      sourceType: z.literal(ChatSourceTypeEnum.app),
      userId: z.string().min(1),
      chatId: z.string().min(1)
    }),
    LegacySandboxCommonSchema.extend({
      sourceType: z.literal(ChatSourceTypeEnum.skillEdit),
      userId: z.string().nullish(),
      chatId: z.string().nullish()
    })
  ])
  .superRefine((instance, ctx) => {
    if (instance.metadata?.userLevelMigration?.phase !== 'completed') return;

    if (instance.status !== SandboxStatusEnum.stopped) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Completed Legacy migration requires stopped status'
      });
    }
    if (instance.metadata.archive?.state !== 'archived') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata', 'archive', 'state'],
        message: 'Completed Legacy migration requires archived state'
      });
    }
  });
export type LegacySandboxInstanceSchemaType = z.infer<typeof LegacySandboxInstanceZodSchema>;

const LegacySandboxInstanceSchema = new Schema(
  {
    provider: String,
    sandboxId: String,
    appId: String,
    sourceType: {
      type: String,
      enum: Object.values(ChatSourceTypeEnum)
    },
    sourceId: String,
    userId: String,
    chatId: String,
    type: {
      type: String,
      enum: Object.values(SandboxTypeEnum)
    },
    status: {
      type: String,
      enum: Object.values(SandboxStatusEnum)
    },
    lastActiveAt: Date,
    createdAt: Date,
    limit: Schema.Types.Mixed,
    storage: Schema.Types.Mixed,
    metadata: Schema.Types.Mixed
  },
  {
    strict: false
  }
);

export const MongoLegacySandboxInstance = getMongoModel<LegacySandboxInstanceSchemaType>(
  legacyCollectionName,
  LegacySandboxInstanceSchema
);
