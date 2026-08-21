import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import z from 'zod';

/* ============================================================================
 * API: 清理重复 Chat 会话头
 * Route: POST /api/admin/dataClean/cleanupDuplicateChats
 * Method: POST
 * Description: 管理员数据清洗接口，按 appId + chatId 查找重复 chats 记录，保留 updateTime 最新的一条并可选择删除其余会话头。
 * Tags: ['Admin', 'DataClean', 'Chat', 'Delete']
 * ============================================================================ */

const DEFAULT_SAMPLE_LIMIT = 20;
const CLEANUP_DUPLICATE_CHATS_INDEX_NAME = 'idx_cleanup_duplicate_chats_appId_chatId';

const CleanupDuplicateChatsBodySchema = z
  .object({
    dryRun: BoolSchema.optional().meta({
      example: true,
      description: '是否只扫描统计不删除'
    }),
    dryrun: BoolSchema.optional().meta({
      example: true,
      description: '是否只扫描统计不删除，兼容小写参数'
    }),
    sampleLimit: IntSchema.refine((value) => value >= 0 && value <= 100)
      .optional()
      .meta({
        example: DEFAULT_SAMPLE_LIMIT,
        description: '返回重复组样本数量，范围 0~100'
      })
  })
  .transform((body) => ({
    dryRun: body.dryRun ?? body.dryrun ?? true,
    sampleLimit: body.sampleLimit ?? DEFAULT_SAMPLE_LIMIT
  }));
export type CleanupDuplicateChatsBodyType = z.infer<typeof CleanupDuplicateChatsBodySchema>;

const DuplicateChatGroupSampleSchema = z.object({
  appId: z.string().meta({ description: '应用 ID 或历史 sourceId' }),
  chatId: z.string().meta({ description: '会话 ID' }),
  totalCount: z.number().int().nonnegative().meta({ description: '该组会话头总数' }),
  duplicateCount: z.number().int().nonnegative().meta({ description: '该组预计删除数量' }),
  keepId: z.string().optional().meta({ description: '保留的 chats 记录 ID' }),
  deleteIds: z.array(z.string()).meta({ description: '预计删除的 chats 记录 ID 样本' })
});
export type DuplicateChatGroupSampleType = z.infer<typeof DuplicateChatGroupSampleSchema>;

const CleanupDuplicateChatsResponseSchema = z.object({
  dryRun: z.boolean().meta({ description: '是否 dryRun' }),
  scannedDuplicateGroupCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '扫描到的重复 appId + chatId 组数' }),
  duplicateDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '预计删除的重复 chats 记录数' }),
  deletedDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '实际删除的 chats 记录数，dryRun 时为 0' }),
  sampleLimit: z.number().int().nonnegative().meta({ description: '返回样本数量限制' }),
  samples: z.array(DuplicateChatGroupSampleSchema).meta({ description: '重复组样本' })
});
export type CleanupDuplicateChatsResponseType = z.infer<typeof CleanupDuplicateChatsResponseSchema>;

type DuplicateKeyGroup = {
  _id: {
    appId: unknown;
    chatId: string;
  };
  count: number;
};

type DuplicateChatDoc = {
  _id: unknown;
};

const stringifyId = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
};

/**
 * 为重复会话头清理创建临时查询索引。
 *
 * 历史库里唯一索引可能因为重复数据没有建成功，迁移前先补一个非唯一索引，
 * 避免全表扫描；如果已经存在同 key 索引（无论唯一/非唯一），直接复用。
 */
const ensureDuplicateChatCleanupIndex = async () => {
  const indexes = await MongoChat.collection.indexes();
  const hasAppIdChatIdIndex = indexes.some((index) => {
    const keys = Object.keys(index.key);
    return keys.length === 2 && index.key.appId === 1 && index.key.chatId === 1;
  });

  if (hasAppIdChatIdIndex) return;

  await MongoChat.collection.createIndex(
    { appId: 1, chatId: 1 },
    {
      name: CLEANUP_DUPLICATE_CHATS_INDEX_NAME,
      background: true
    }
  );
};

const findDuplicateChatGroups = () =>
  MongoChat.aggregate<DuplicateKeyGroup>(
    [
      {
        $group: {
          _id: { appId: '$appId', chatId: '$chatId' },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 },
          '_id.appId': { $exists: true, $ne: null },
          '_id.chatId': { $exists: true, $type: 'string', $ne: '' }
        }
      },
      { $sort: { count: -1 } }
    ],
    { allowDiskUse: true }
  );

const findDuplicateChatDocs = (group: DuplicateKeyGroup) =>
  MongoChat.find({ appId: group._id.appId, chatId: group._id.chatId }, '_id')
    .sort({ updateTime: -1, _id: -1 })
    .lean<DuplicateChatDoc[]>();

/**
 * 清理 `chats` 中历史重复会话头。
 *
 * 只删除 `chats` 元数据，不删除 `chatitems` 和 `chat_item_responses` 中的消息内容。
 * 对每组重复的 `appId + chatId`，保留 `updateTime` 最新的一条；若时间相同，用 `_id`
 * 倒序作为稳定兜底，避免多次 dry-run 与正式执行选择不同记录。
 */
export async function runCleanupDuplicateChatsMigration(
  params: CleanupDuplicateChatsBodyType
): Promise<CleanupDuplicateChatsResponseType> {
  await ensureDuplicateChatCleanupIndex();

  const duplicateGroups = await findDuplicateChatGroups();

  let duplicateDocumentCount = 0;
  let deletedDocumentCount = 0;
  const samples: DuplicateChatGroupSampleType[] = [];

  for (const group of duplicateGroups) {
    const docs = await findDuplicateChatDocs(group);
    const keepDoc = docs[0];
    const duplicateDocs = docs.slice(1);

    if (!keepDoc || duplicateDocs.length === 0) {
      continue;
    }

    const deleteIds = duplicateDocs.map((doc) => doc._id);
    duplicateDocumentCount += deleteIds.length;

    if (samples.length < params.sampleLimit) {
      samples.push({
        appId: stringifyId(group._id.appId),
        chatId: group._id.chatId,
        totalCount: docs.length,
        duplicateCount: deleteIds.length,
        keepId: stringifyId(keepDoc._id),
        deleteIds: deleteIds.map(stringifyId)
      });
    }

    if (!params.dryRun) {
      const result = await MongoChat.deleteMany({ _id: { $in: deleteIds } });
      deletedDocumentCount += result.deletedCount;
    }
  }

  return CleanupDuplicateChatsResponseSchema.parse({
    dryRun: params.dryRun,
    scannedDuplicateGroupCount: duplicateGroups.length,
    duplicateDocumentCount,
    deletedDocumentCount,
    sampleLimit: params.sampleLimit,
    samples
  });
}

/**
 * 管理员重复会话头清理接口。
 *
 * 默认 dryRun。正式执行时只删除重复的 `chats` 会话头，消息明细保留不动。
 */
async function handler(req: ApiRequestProps): Promise<CleanupDuplicateChatsResponseType> {
  await authCert({ req, authRoot: true });

  const { body } = parseApiInput({
    req,
    bodySchema: CleanupDuplicateChatsBodySchema
  });

  return runCleanupDuplicateChatsMigration(body);
}

export default NextAPI(handler);
