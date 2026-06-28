import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import type { SandboxResourceRef } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { S3Sources } from '@fastgpt/service/common/s3/contracts/type';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import type { Types } from '@fastgpt/service/common/mongo';
import z from 'zod';

const Init4150Beta6BodySchema = z.object({
  dryRun: z.boolean().default(true)
});
type Init4150Beta6BodyType = z.infer<typeof Init4150Beta6BodySchema>;

const LegacyDebugChatCleanupItemSchema = z.object({
  skillId: z.string(),
  chatCount: z.number().int().nonnegative(),
  chatItemCount: z.number().int().nonnegative(),
  chatItemResponseCount: z.number().int().nonnegative(),
  deleted: z.boolean()
});

const Init4150Beta6ResponseSchema = z.object({
  dryRun: z.boolean(),
  scannedSkillCount: z.number().int().nonnegative(),
  sandboxMigration: z.object({
    skillMatchedCount: z.number().int().nonnegative(),
    skillModifiedCount: z.number().int().nonnegative(),
    appMatchedCount: z.number().int().nonnegative(),
    appModifiedCount: z.number().int().nonnegative(),
    legacyFieldMatchedCount: z.number().int().nonnegative(),
    legacyFieldModifiedCount: z.number().int().nonnegative(),
    orphanMatchedCount: z.number().int().nonnegative(),
    orphanDeletedCount: z.number().int().nonnegative(),
    orphanFailedCount: z.number().int().nonnegative()
  }),
  legacyDebugChatCleanup: z.object({
    conflictAppSkillCount: z.number().int().nonnegative(),
    cleanupSkillCount: z.number().int().nonnegative(),
    totalLegacyChats: z.number().int().nonnegative(),
    totalChatItems: z.number().int().nonnegative(),
    totalChatItemResponses: z.number().int().nonnegative(),
    deletedSkillCount: z.number().int().nonnegative(),
    skippedEmptyCount: z.number().int().nonnegative(),
    list: z.array(LegacyDebugChatCleanupItemSchema)
  })
});
type Init4150Beta6ResponseType = z.infer<typeof Init4150Beta6ResponseSchema>;
type LegacyDebugChatCleanupItem =
  Init4150Beta6ResponseType['legacyDebugChatCleanup']['list'][number];
type SandboxSourceUpdateOperation = {
  filter: {
    _id: Types.ObjectId;
  };
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
};
type LegacySandboxSourceDoc = {
  _id: Types.ObjectId;
  appId?: string | null;
  type?: SandboxTypeEnum | string | null;
  metadata?: {
    skillId?: string | null;
  };
};

const sandboxInstanceCollection = () => MongoSandboxInstance.collection;

const buildLegacySkillDebugChatQuery = (skillId: string) => ({
  appId: skillId,
  source: ChatSourceEnum.test,
  sourceType: { $exists: false }
});

const getAllSkillIds = async () => {
  const skillList = await MongoAgentSkills.find({}, '_id').lean();
  return skillList.map((skill) => String(skill._id));
};

const getConflictAppSkillIds = async (skillIds: string[]) => {
  if (skillIds.length === 0) return new Set<string>();

  const appList = await MongoApp.find(
    {
      _id: { $in: skillIds }
    },
    '_id'
  ).lean();

  return new Set(appList.map((app) => String(app._id)));
};

const buildMissingSandboxSourceQuery = () => {
  return {
    $or: [
      { sourceType: { $exists: false } },
      { sourceType: { $exists: true, $nin: Object.values(ChatSourceTypeEnum) } },
      { sourceId: { $exists: false } },
      { sourceId: { $in: ['', null] } }
    ]
  };
};

const buildSandboxSourceMigrationQuery = () => {
  return {
    $and: [buildMissingSandboxSourceQuery()]
  };
};

const buildLegacySandboxFieldCleanupQuery = () => {
  return {
    sourceType: { $in: Object.values(ChatSourceTypeEnum) },
    sourceId: { $exists: true, $nin: ['', null] },
    $or: [
      { appId: { $exists: true } },
      { 'metadata.skillId': { $exists: true } },
      { type: { $exists: true } }
    ]
  };
};

const updateSandboxSources = async (operations: SandboxSourceUpdateOperation[]) => {
  const results = await Promise.all(
    operations.map((operation) =>
      sandboxInstanceCollection().updateOne(operation.filter, {
        $set: {
          sourceType: operation.sourceType,
          sourceId: operation.sourceId
        },
        $unset: {
          appId: '',
          'metadata.skillId': '',
          type: ''
        }
      })
    )
  );
  const getUpdateCount = (item: { matchedCount?: number; modifiedCount?: number }) => ({
    matchedCount: typeof item.matchedCount === 'number' ? item.matchedCount : 0,
    modifiedCount: typeof item.modifiedCount === 'number' ? item.modifiedCount : 0
  });

  return {
    matchedCount: results.reduce((sum, item) => sum + getUpdateCount(item).matchedCount, 0),
    modifiedCount: results.reduce((sum, item) => sum + getUpdateCount(item).modifiedCount, 0)
  };
};

/**
 * 解析旧 sandbox 实例归属。
 *
 * 4.15.0-beta6 之前的 Skill Edit sandbox 已经写入过 type=edit-debug；
 * 缺少 type 的旧记录统一按 App 处理。
 */
const resolveLegacySandboxSource = ({
  doc
}: {
  doc: LegacySandboxSourceDoc;
}): Omit<SandboxSourceUpdateOperation, 'filter'> | undefined => {
  const appId = doc.appId ? String(doc.appId) : undefined;
  const metadataSkillId = doc.metadata?.skillId || undefined;

  if (doc.type === SandboxTypeEnum.editDebug) {
    const sourceId = metadataSkillId || appId;
    if (!sourceId) return;

    return {
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId
    };
  }

  if (appId) {
    return {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    };
  }
};

const migrateSandboxInstances = async ({
  dryRun
}: {
  dryRun: boolean;
}): Promise<Init4150Beta6ResponseType['sandboxMigration']> => {
  const legacySandboxDocs = (await sandboxInstanceCollection()
    .find(buildSandboxSourceMigrationQuery(), {
      projection: {
        _id: 1,
        appId: 1,
        type: 1,
        provider: 1,
        sandboxId: 1,
        status: 1,
        lastActiveAt: 1,
        'metadata.skillId': 1
      }
    })
    .toArray()) as Array<LegacySandboxSourceDoc & SandboxResourceRef>;
  const sourceUpdateOperations: SandboxSourceUpdateOperation[] = legacySandboxDocs.flatMap(
    (doc) => {
      const source = resolveLegacySandboxSource({ doc });

      if (!source) return [];

      return [
        {
          filter: { _id: doc._id },
          ...source
        }
      ];
    }
  );
  const sourceUpdateIdSet = new Set(
    sourceUpdateOperations.map((operation) => String(operation.filter._id))
  );
  const orphanSandboxDocs = legacySandboxDocs.filter(
    (doc) => !sourceUpdateIdSet.has(String(doc._id))
  );
  const skillUpdateOperations = sourceUpdateOperations.filter(
    (operation) => operation.sourceType === ChatSourceTypeEnum.skillEdit
  );
  const appUpdateOperations = sourceUpdateOperations.filter(
    (operation) => operation.sourceType === ChatSourceTypeEnum.app
  );

  if (dryRun) {
    const legacyFieldMatchedCount = await sandboxInstanceCollection().countDocuments(
      buildLegacySandboxFieldCleanupQuery()
    );

    return {
      skillMatchedCount: skillUpdateOperations.length,
      skillModifiedCount: 0,
      appMatchedCount: appUpdateOperations.length,
      appModifiedCount: 0,
      legacyFieldMatchedCount,
      legacyFieldModifiedCount: 0,
      orphanMatchedCount: orphanSandboxDocs.length,
      orphanDeletedCount: 0,
      orphanFailedCount: 0
    };
  }

  const skillUpdateResult =
    skillUpdateOperations.length > 0
      ? await updateSandboxSources(skillUpdateOperations)
      : undefined;
  const appUpdateResult =
    appUpdateOperations.length > 0 ? await updateSandboxSources(appUpdateOperations) : undefined;
  const legacyFieldCleanupResult = await sandboxInstanceCollection().updateMany(
    buildLegacySandboxFieldCleanupQuery(),
    {
      $unset: {
        appId: '',
        'metadata.skillId': '',
        type: ''
      }
    }
  );
  const { deleteSandboxResource } =
    await import('@fastgpt/service/core/ai/sandbox/application/resource');
  const orphanDeleteResults = await Promise.allSettled(
    orphanSandboxDocs.map((doc) => deleteSandboxResource(doc))
  );

  return {
    skillMatchedCount: skillUpdateOperations.length,
    skillModifiedCount: skillUpdateResult?.modifiedCount ?? 0,
    appMatchedCount: appUpdateOperations.length,
    appModifiedCount: appUpdateResult?.modifiedCount ?? 0,
    legacyFieldMatchedCount:
      typeof legacyFieldCleanupResult.matchedCount === 'number'
        ? legacyFieldCleanupResult.matchedCount
        : 0,
    legacyFieldModifiedCount:
      typeof legacyFieldCleanupResult.modifiedCount === 'number'
        ? legacyFieldCleanupResult.modifiedCount
        : 0,
    orphanMatchedCount: orphanSandboxDocs.length,
    orphanDeletedCount: orphanDeleteResults.filter((item) => item.status === 'fulfilled').length,
    orphanFailedCount: orphanDeleteResults.filter((item) => item.status === 'rejected').length
  };
};

const getLegacyDebugChatStats = async (skillId: string): Promise<LegacyDebugChatCleanupItem> => {
  const legacyQuery = buildLegacySkillDebugChatQuery(skillId);
  const legacyChatList = await MongoChat.find(legacyQuery, 'chatId').lean();
  const legacyChatIds = legacyChatList.map((chat) => chat.chatId).filter(Boolean);
  const legacyChatItemQuery = {
    appId: skillId,
    sourceType: { $exists: false },
    chatId: { $in: legacyChatIds }
  };
  const [chatItemCount, chatItemResponseCount] =
    legacyChatIds.length > 0
      ? await Promise.all([
          MongoChatItem.countDocuments(legacyChatItemQuery),
          MongoChatItemResponse.countDocuments(legacyChatItemQuery)
        ])
      : [0, 0];

  return {
    skillId,
    chatCount: legacyChatIds.length,
    chatItemCount,
    chatItemResponseCount,
    deleted: false
  };
};

const cleanupLegacySkillDebugChatResources = async (skillId: string) => {
  const legacyQuery = buildLegacySkillDebugChatQuery(skillId);
  const legacyChatList = await MongoChat.find(legacyQuery, 'chatId').lean();
  const legacyChatIds = legacyChatList.map((chat) => chat.chatId).filter(Boolean);
  const itemQuery = {
    appId: skillId,
    sourceType: { $exists: false },
    chatId: { $in: legacyChatIds }
  };

  if (legacyChatIds.length > 0) {
    await Promise.all([
      MongoChatItemResponse.deleteMany(itemQuery),
      MongoChatItem.deleteMany(itemQuery)
    ]);
  }
  await MongoChat.deleteMany(legacyQuery);

  // 旧 Skill Debug 曾按 App legacy key 写入：chat/${skillId}/...。
  // 这里只清 legacy prefix，不能删除 chat/app/${skillId} 或 chat/skillEdit/${skillId}。
  const legacyPrefix = [S3Sources.chat, skillId].join('/');
  const chatBucket = getS3ChatSource();
  const publicBucket = global.s3BucketMap[S3Buckets.public];

  await chatBucket.addDeleteJob({ prefix: legacyPrefix });
  await publicBucket.addDeleteJob({ prefix: legacyPrefix });
};

const cleanupLegacyDebugChats = async ({
  dryRun,
  skillIds,
  conflictAppSkillIds
}: {
  dryRun: boolean;
  skillIds: string[];
  conflictAppSkillIds: Set<string>;
}): Promise<Init4150Beta6ResponseType['legacyDebugChatCleanup']> => {
  const cleanupSkillIds = skillIds.filter((skillId) => !conflictAppSkillIds.has(skillId));
  const list = await Promise.all(
    cleanupSkillIds.map((skillId) => getLegacyDebugChatStats(skillId))
  );

  if (!dryRun) {
    const deletableList = list.filter((item) => item.chatCount > 0);

    await Promise.all(
      deletableList.map((item) => cleanupLegacySkillDebugChatResources(item.skillId))
    );

    deletableList.forEach((item) => {
      item.deleted = true;
    });
  }

  return {
    conflictAppSkillCount: conflictAppSkillIds.size,
    cleanupSkillCount: cleanupSkillIds.length,
    totalLegacyChats: list.reduce((sum, item) => sum + item.chatCount, 0),
    totalChatItems: list.reduce((sum, item) => sum + item.chatItemCount, 0),
    totalChatItemResponses: list.reduce((sum, item) => sum + item.chatItemResponseCount, 0),
    deletedSkillCount: list.filter((item) => item.deleted).length,
    skippedEmptyCount: list.filter((item) => item.chatCount === 0).length,
    list
  };
};

/**
 * 执行 4.15.0-beta6 迁移初始化。
 *
 * 该逻辑只服务本次升级脚本，不下沉为通用 service：
 * 1. 用历史 type=edit-debug 将 sandbox instance 标记为 skillEdit source。
 * 2. 缺少 type 但带 appId 的旧记录按 App sandbox 标记。
 * 3. 删除缺少 appId 且无法归属的旧 orphan sandbox，包含远端资源、volume、S3 归档和 Mongo 记录。
 * 4. 清理旧 Skill Debug chat：先用 apps 表去掉同 ID App，再删除剩余 skillId 的旧 debug chat。
 *
 * 这里不能支持传入部分 skillIds，否则“剩余 sandbox 视为 App”会把未扫描到的 Skill sandbox
 * 误迁成 App。
 */
export async function runInit4150Beta6Migration({
  dryRun = true
}: Init4150Beta6BodyType): Promise<Init4150Beta6ResponseType> {
  const skillIds = await getAllSkillIds();
  const conflictAppSkillIds = await getConflictAppSkillIds(skillIds);
  const sandboxMigration = await migrateSandboxInstances({
    dryRun
  });
  const legacyDebugChatCleanup = await cleanupLegacyDebugChats({
    dryRun,
    skillIds,
    conflictAppSkillIds
  });

  return {
    dryRun,
    scannedSkillCount: skillIds.length,
    sandboxMigration,
    legacyDebugChatCleanup
  };
}

/**
 * 4.15.0-beta6 初始化脚本。
 *
 * 默认 dry-run。真正执行时会补齐 `agent_sandbox_instances.sourceType/sourceId`，
 * 并清理旧 Skill Debug chat 三表与旧格式 Chat S3 文件。
 */
async function handler(req: ApiRequestProps): Promise<Init4150Beta6ResponseType> {
  await authCert({ req, authRoot: true });

  const { dryRun } = parseApiInput({
    req,
    bodySchema: Init4150Beta6BodySchema
  }).body;

  const result = await runInit4150Beta6Migration({
    dryRun
  });

  return Init4150Beta6ResponseSchema.parse(result);
}

export default NextAPI(handler);
