import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema } from '@fastgpt/global/common/zod';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getLogger } from '@fastgpt/service/common/logger';
import { Types, type AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import z from 'zod';

const logger = getLogger(['admin/4163/initAppCreateTime']);
const BATCH_SIZE = 500;

const InitAppCreateTimeBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true)
});
export type InitAppCreateTimeBody = z.infer<typeof InitAppCreateTimeBodySchema>;

export type InitAppCreateTimeResponse = {
  dryRun: boolean;
  scannedRecords: number;
  updatedRecords: number;
  skippedInvalidId: number;
};

type AppCreateTimeMigrationItem = {
  _id: unknown;
};

/**
 * 从 App `_id` 提取创建时间。非法 ObjectId 返回 undefined，不猜测。
 */
export const getAppCreateTimeFromObjectId = (id: unknown): Date | undefined => {
  try {
    if (id instanceof Types.ObjectId) {
      return id.getTimestamp();
    }
    const idStr = String(id ?? '');
    if (!Types.ObjectId.isValid(idStr) || String(new Types.ObjectId(idStr)) !== idStr) {
      return undefined;
    }
    return new Types.ObjectId(idStr).getTimestamp();
  } catch {
    return undefined;
  }
};

/**
 * 为缺少 createTime 的历史 App 用 ObjectId 时间回填。
 *
 * 可重复执行：已有 createTime 的记录不会被覆盖。默认 dry-run。
 */
export async function migrateAppCreateTime({
  dryRun
}: InitAppCreateTimeBody): Promise<InitAppCreateTimeResponse> {
  let lastId: string | undefined;
  let scannedRecords = 0;
  let updatedRecords = 0;
  let skippedInvalidId = 0;

  while (true) {
    const apps = (await MongoApp.find(
      {
        ...(lastId
          ? {
              _id: {
                $gt: lastId
              }
            }
          : {}),
        $or: [{ createTime: { $exists: false } }, { createTime: null }]
      },
      {
        _id: 1
      }
    )
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean()) as AppCreateTimeMigrationItem[];

    if (apps.length === 0) {
      break;
    }

    scannedRecords += apps.length;
    lastId = String(apps[apps.length - 1]._id);

    const ops: AnyBulkWriteOperation[] = [];

    for (const app of apps) {
      const createTime = getAppCreateTimeFromObjectId(app._id);
      if (!createTime) {
        skippedInvalidId += 1;
        continue;
      }

      ops.push({
        updateOne: {
          filter: {
            _id: app._id,
            $or: [{ createTime: { $exists: false } }, { createTime: null }]
          },
          update: {
            $set: {
              createTime
            }
          }
        }
      });
    }

    if (ops.length === 0 || dryRun) {
      continue;
    }

    const result = await MongoApp.bulkWrite(ops, {
      ordered: false
    });
    updatedRecords += result.modifiedCount;
    logger.info(`Updated ${result.modifiedCount} app createTime`);
  }

  return {
    dryRun,
    scannedRecords,
    updatedRecords,
    skippedInvalidId
  };
}

/** 4.16.3 为历史 App 回填 createTime，默认仅 dry-run。 */
async function handler(req: ApiRequestProps): Promise<InitAppCreateTimeResponse> {
  await authCert({ req, authRoot: true });
  const { body } = parseApiInput({
    req,
    bodySchema: InitAppCreateTimeBodySchema
  });

  return migrateAppCreateTime(body);
}

export default NextAPI(handler);
