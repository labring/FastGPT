/** beta6 旧 Skill Debug Chat 清理，只处理缺失 sourceType 的历史数据。 */
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { S3Buckets } from '../../../../../common/s3/config/constants';
import { S3Sources } from '../../../../../common/s3/contracts/type';
import { getS3ChatSource } from '../../../../../common/s3/sources/chat';
import { MongoAgentSkills } from '../../../skill/model/schema';
import { MongoApp } from '../../../../app/schema';
import { MongoChatItemResponse } from '../../../../chat/chatItemResponseSchema';
import { MongoChatItem } from '../../../../chat/chatItemSchema';
import { MongoChat } from '../../../../chat/chatSchema';
import type { LegacyDebugChatCleanupItem, LegacyDebugChatCleanupResult } from './types';

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
  const appList = await MongoApp.find({ _id: { $in: skillIds } }, '_id').lean();
  return new Set(appList.map((app) => String(app._id)));
};

const getLegacyDebugChatStats = async (skillId: string): Promise<LegacyDebugChatCleanupItem> => {
  const legacyChatList = await MongoChat.find(
    buildLegacySkillDebugChatQuery(skillId),
    'chatId'
  ).lean();
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
    status: 'pending'
  };
};

/** 按 beta6 原顺序删除三张 Chat 表，再投递旧 S3 prefix 清理任务。 */
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

  const legacyPrefix = [S3Sources.chat, skillId].join('/');
  await getS3ChatSource().addDeleteJob({ prefix: legacyPrefix });
  await global.s3BucketMap[S3Buckets.public].addDeleteJob({ prefix: legacyPrefix });
};

/**
 * 执行已删除 beta6 脚本中的旧 Skill Debug Chat 清理。
 *
 * 与 App 同 ID 的 Skill 按原脚本规则跳过，避免把无 sourceType 的 App Chat 误删。
 */
export async function cleanupLegacySkillDebugChats(params: { dryRun: boolean }): Promise<{
  cleanup: LegacyDebugChatCleanupResult;
}> {
  const skillIds = await getAllSkillIds();
  const conflictAppSkillIds = await getConflictAppSkillIds(skillIds);
  const cleanupSkillIds = skillIds.filter((skillId) => !conflictAppSkillIds.has(skillId));
  const list = await Promise.all(cleanupSkillIds.map(getLegacyDebugChatStats));

  if (!params.dryRun) {
    const deletableList = list.filter((item) => item.chatCount > 0);
    await Promise.all(
      deletableList.map((item) => cleanupLegacySkillDebugChatResources(item.skillId))
    );
    deletableList.forEach((item) => {
      item.status = 'deleted';
    });
  }

  const pendingChatCount = await Promise.all(
    cleanupSkillIds.map((skillId) =>
      MongoChat.countDocuments(buildLegacySkillDebugChatQuery(skillId))
    )
  ).then((counts) => counts.reduce((sum, count) => sum + count, 0));

  return {
    cleanup: {
      conflictAppSkillCount: conflictAppSkillIds.size,
      matchedSkillCount: list.length,
      totalLegacyChats: list.reduce((sum, item) => sum + item.chatCount, 0),
      totalChatItems: list.reduce((sum, item) => sum + item.chatItemCount, 0),
      totalChatItemResponses: list.reduce((sum, item) => sum + item.chatItemResponseCount, 0),
      cleanedSkillCount: list.filter((item) => item.status === 'deleted').length,
      pendingChatCount,
      list
    }
  };
}
