import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import type { SandboxResourceRef } from '@fastgpt/service/core/ai/sandbox/instance/repository';
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

const buildSkillSandboxQuery = (skillIds: string[]) => {
  return {
    $or: [{ appId: { $in: skillIds } }, { 'metadata.skillId': { $in: skillIds } }]
  };
};

const buildRemainingAppSandboxQuery = (skillIds: string[]) => {
  return {
    appId: { $exists: true, $nin: ['', null, ...skillIds] },
    $or: [{ 'metadata.skillId': { $exists: false } }, { 'metadata.skillId': { $nin: skillIds } }]
  };
};

const buildOrphanSandboxQuery = (skillIds: string[]) => {
  return {
    $or: [{ appId: { $exists: false } }, { appId: { $in: ['', null] } }],
    $and: [
      {
        $or: [
          { 'metadata.skillId': { $exists: false } },
          { 'metadata.skillId': { $nin: skillIds } }
        ]
      }
    ]
  };
};

const getSkillSourceIdFromSandbox = ({
  doc,
  skillIdSet
}: {
  doc: {
    _id: unknown;
    appId?: string;
    metadata?: {
      skillId?: string;
    };
  };
  skillIdSet: Set<string>;
}) => {
  const metadataSkillId = doc.metadata?.skillId;
  if (metadataSkillId && skillIdSet.has(metadataSkillId)) return metadataSkillId;

  const appId = doc.appId ? String(doc.appId) : undefined;
  if (appId && skillIdSet.has(appId)) return appId;
};

const migrateSandboxInstances = async ({
  dryRun,
  skillIds
}: {
  dryRun: boolean;
  skillIds: string[];
}): Promise<Init4150Beta6ResponseType['sandboxMigration']> => {
  const skillIdSet = new Set(skillIds);
  const skillSandboxDocs = await MongoSandboxInstance.find(
    buildSkillSandboxQuery(skillIds),
    '_id appId metadata.skillId'
  ).lean<
    {
      _id: unknown;
      appId?: string;
      metadata?: {
        skillId?: string;
      };
    }[]
  >();
  const skillUpdateOperations = skillSandboxDocs.flatMap((doc) => {
    const sourceId = getSkillSourceIdFromSandbox({
      doc,
      skillIdSet
    });

    if (!sourceId) return [];

    return [
      {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              sourceType: ChatSourceTypeEnum.skillEdit,
              sourceId
            }
          }
        }
      }
    ];
  });
  const appDryRunQuery = buildRemainingAppSandboxQuery(skillIds);
  const orphanSandboxQuery = buildOrphanSandboxQuery(skillIds);

  if (dryRun) {
    const [appMatchedCount, orphanMatchedCount] = await Promise.all([
      MongoSandboxInstance.countDocuments(appDryRunQuery),
      MongoSandboxInstance.countDocuments(orphanSandboxQuery)
    ]);

    return {
      skillMatchedCount: skillUpdateOperations.length,
      skillModifiedCount: 0,
      appMatchedCount,
      appModifiedCount: 0,
      orphanMatchedCount,
      orphanDeletedCount: 0,
      orphanFailedCount: 0
    };
  }

  const skillUpdateResult =
    skillUpdateOperations.length > 0
      ? await MongoSandboxInstance.bulkWrite(skillUpdateOperations)
      : undefined;
  const appSandboxDocs = await MongoSandboxInstance.find(appDryRunQuery, '_id appId').lean<
    { _id: unknown; appId?: string }[]
  >();
  const appUpdateOperations = appSandboxDocs.flatMap((doc) => {
    if (!doc.appId) return [];

    return [
      {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              sourceType: ChatSourceTypeEnum.app,
              sourceId: String(doc.appId)
            }
          }
        }
      }
    ];
  });
  const appUpdateResult =
    appUpdateOperations.length > 0
      ? await MongoSandboxInstance.bulkWrite(appUpdateOperations)
      : undefined;
  const orphanSandboxDocs = await MongoSandboxInstance.find(
    orphanSandboxQuery,
    '_id provider sandboxId status lastActiveAt'
  ).lean<SandboxResourceRef[]>();
  const { deleteSandboxResource } =
    await import('@fastgpt/service/core/ai/sandbox/service/resource');
  const orphanDeleteResults = await Promise.allSettled(
    orphanSandboxDocs.map((doc) => deleteSandboxResource(doc))
  );

  return {
    skillMatchedCount: skillUpdateOperations.length,
    skillModifiedCount: skillUpdateResult?.modifiedCount ?? 0,
    appMatchedCount: appUpdateOperations.length,
    appModifiedCount: appUpdateResult?.modifiedCount ?? 0,
    orphanMatchedCount: orphanSandboxDocs.length,
    orphanDeletedCount: orphanDeleteResults.filter((item) => item.status === 'fulfilled').length,
    orphanFailedCount: orphanDeleteResults.filter((item) => item.status === 'rejected').length
  };
};

const getLegacyDebugChatStats = async (skillId: string): Promise<LegacyDebugChatCleanupItem> => {
  const legacyQuery = buildChatSourceQuery({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    legacySkillDebug: true
  });
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
    // dry-run 不应加载真实删除链路，避免本地缺少 sandbox adapter 构建产物时无法统计。
    const { deleteChatResourcesBySource } = await import('@fastgpt/service/core/chat/delete');

    await Promise.all(
      deletableList.map((item) =>
        deleteChatResourcesBySource({
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: item.skillId,
          legacySkillDebug: true
        })
      )
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
 * 1. 全量读取 skills 表，将命中 skillId 的 sandbox instance 标记为 skillEdit source。
 * 2. 将剩余未命中 Skill 且带 appId 的 sandbox instance 标记为 app source。
 * 3. 删除没有 appId 且无法归属到 Skill 的旧 orphan sandbox，包含远端资源、volume、S3 归档和 Mongo 记录。
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
    dryRun,
    skillIds
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
