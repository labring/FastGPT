/**
 * Sandbox 实例原子层。
 *
 * Repository 只负责 v2 记录查询和稳定态更新，Saga 抢占与终态投影由 definition transaction hook 完成。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from './schema';
import {
  SandboxInstanceStatusEnum,
  SandboxMetadataSchema,
  type SandboxInstanceSchemaType,
  type SandboxInstanceStatusType,
  type SandboxProviderType
} from '../../type';

const SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE = 100;

export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  | 'provider'
  | 'sandboxId'
  | 'sourceType'
  | 'sourceId'
  | 'userId'
  | 'status'
  | 'lastActiveAt'
  | 'limit'
  | 'storage'
  | 'metadata'
> & {
  _id: unknown;
};

export type SandboxResourceRef = Partial<
  Pick<
    SandboxResourceDoc,
    'status' | 'lastActiveAt' | 'sourceType' | 'sourceId' | 'userId' | 'metadata'
  >
> & {
  provider: SandboxProviderType;
  sandboxId: string;
  _id?: unknown;
};

export type SandboxSourceParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
};

const buildSandboxResourceSourceQuery = ({ sourceType, sourceId }: SandboxSourceParams) => {
  if (sourceType === ChatSourceTypeEnum.app || sourceType === ChatSourceTypeEnum.skillEdit) {
    return { sourceType, sourceId };
  }
  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox resources');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported sandbox source type: ${exhaustiveCheck}`);
};

const buildMetadataSet = (metadata?: Record<string, unknown>) => {
  if (!metadata) return {};
  const parsed = SandboxMetadataSchema.parse(metadata);
  if (parsed.activeSaga) {
    throw new Error('Stable Sandbox metadata writes cannot contain activeSaga');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [`metadata.${key}`, value])
  );
};

/** 仅刷新已经发布的 running 记录；不存在或处于过渡态时绝不 upsert。 */
export async function touchRunningSandboxInstance(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  storage?: SandboxInstanceSchemaType['storage'];
  limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  metadata?: Record<string, unknown>;
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      provider: params.provider,
      sandboxId: params.sandboxId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      status: SandboxInstanceStatusEnum.running,
      'metadata.activeSaga': { $exists: false }
    },
    {
      $set: {
        lastActiveAt: new Date(),
        ...(params.storage !== undefined ? { storage: params.storage } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...buildMetadataSet(params.metadata)
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 查询可被 stop cron 抢占的 running 记录。 */
export async function findInactiveRunningSandboxResources(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    status: SandboxInstanceStatusEnum.running,
    lastActiveAt: { $lt: inactiveBefore },
    'metadata.activeSaga': { $exists: false }
  }).lean<SandboxResourceDoc[]>();
}

/** 流式读取 stopped 归档候选。 */
export function createSandboxResourcesToArchiveCursor(params: {
  inactiveBefore: Date;
  providers?: SandboxProviderType[];
}) {
  const { inactiveBefore, providers = ['opensandbox', 'sealosdevbox'] } = params;
  return MongoSandboxInstance.find({
    provider: { $in: providers },
    status: SandboxInstanceStatusEnum.stopped,
    lastActiveAt: { $lt: inactiveBefore },
    'metadata.activeSaga': { $exists: false }
  })
    .sort({ lastActiveAt: -1 })
    .lean<SandboxResourceDoc>()
    .cursor({ batchSize: SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE });
}

export async function findSandboxResourcesBySource(params: SandboxSourceParams) {
  return MongoSandboxInstance.find(buildSandboxResourceSourceQuery(params)).lean<
    SandboxResourceDoc[]
  >();
}

export async function findSandboxInstanceBySandboxId(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    ...(params.provider ? { provider: params.provider } : {}),
    sandboxId: params.sandboxId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function findSandboxInstanceBySandboxIdAndSource(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    ...(params.provider ? { provider: params.provider } : {}),
    sandboxId: params.sandboxId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function existsSandboxInstanceBySandboxId(params: {
  provider: SandboxProviderType;
  sandboxId: string;
}) {
  return Boolean(await MongoSandboxInstance.exists(params));
}

export async function findSandboxInstanceBySource(params: {
  provider?: SandboxProviderType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    ...(params.provider ? { provider: params.provider } : {}),
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function findSandboxResourcesBySourceExcludeProvider(params: {
  provider: SandboxProviderType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}) {
  return MongoSandboxInstance.find({
    provider: { $ne: params.provider },
    sourceType: params.sourceType,
    sourceId: params.sourceId
  }).lean<SandboxResourceDoc[]>();
}

export async function countRunningSandboxInstancesBySourceType(
  sourceType: ChatSourceTypeEnum,
  provider?: SandboxProviderType
) {
  return MongoSandboxInstance.countDocuments({
    ...(provider ? { provider } : {}),
    sourceType,
    status: SandboxInstanceStatusEnum.running,
    'metadata.activeSaga': { $exists: false }
  });
}

/** 在 running 稳定态更新业务归属或 metadata，不允许唤醒过渡态。 */
export async function updateSandboxInstanceRecordBySandboxId(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  metadata?: Record<string, unknown>;
  touchActive?: boolean;
}): Promise<SandboxInstanceSchemaType | null> {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      sandboxId: params.sandboxId,
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.touchActive
        ? {
            status: SandboxInstanceStatusEnum.running,
            'metadata.activeSaga': { $exists: false }
          }
        : {})
    },
    {
      $set: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        userId: params.userId,
        ...buildMetadataSet(params.metadata),
        ...(params.touchActive ? { lastActiveAt: new Date() } : {})
      }
    },
    { new: true }
  );
}

export async function findSandboxInstanceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  return MongoSandboxInstance.findOne({
    sandboxId: params.sandboxId,
    ...(params.provider ? { provider: params.provider } : {}),
    'metadata.teamId': params.teamId
  });
}

export async function findSandboxResourceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  return MongoSandboxInstance.findOne({
    sandboxId: params.sandboxId,
    ...(params.provider ? { provider: params.provider } : {}),
    'metadata.teamId': params.teamId
  }).lean<SandboxResourceDoc | null>();
}

export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: { $in: skillIds }
  }).lean<SandboxResourceDoc[]>();
}
