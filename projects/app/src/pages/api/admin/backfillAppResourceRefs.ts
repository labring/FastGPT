import { NextAPI } from '@/service/middleware/entry';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import type { AppResourceRefsType } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { extractAppResourceRefsFromNodes } from '@fastgpt/service/core/app/resourceRefs';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getLogger } from '@fastgpt/service/common/logger';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const logger = getLogger(['backfillAppResourceRefs']);
const DEFAULT_BACKFILL_START_TIME = new Date('2026-05-24T00:00:00.000+08:00');

const QuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
  batchSize: z.coerce.number().int().min(1).max(2000).optional().default(500),
  startTime: z.coerce.date().optional().default(DEFAULT_BACKFILL_START_TIME)
});

type MigrationStats = {
  matched: number;
  updated: number;
};

type ResponseType = {
  message: string;
  dryRun: boolean;
  batchSize: number;
  startTime: string;
  versions: MigrationStats;
  apps: MigrationStats;
};

/**
 * 回填指定时间后的 app_versions.resourceRefs，保证新版 Skill 发布后的版本记录具备统一索引。
 */
async function backfillVersionResourceRefs({
  dryRun,
  batchSize,
  startTime
}: {
  dryRun: boolean;
  batchSize: number;
  startTime: Date;
}): Promise<MigrationStats> {
  let lastId: string | undefined;
  let scanned = 0;
  let matched = 0;
  let updated = 0;

  while (true) {
    const versions = await MongoAppVersion.find(
      {
        ...(lastId ? { _id: { $gt: new Types.ObjectId(lastId) } } : {}),
        time: { $gte: startTime }
      },
      '_id nodes'
    )
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (versions.length === 0) break;

    scanned += versions.length;
    lastId = String(versions[versions.length - 1]._id);

    const operations = versions.map((version) => ({
      updateOne: {
        filter: { _id: version._id },
        update: {
          $set: {
            resourceRefs: extractAppResourceRefsFromNodes(version.nodes)
          }
        }
      }
    }));

    matched += operations.length;

    if (!dryRun && operations.length > 0) {
      const result = await MongoAppVersion.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount + result.upsertedCount;
    }

    logger.info('[version resource refs] backfill progress', {
      scanned,
      matched,
      updated: dryRun ? 0 : updated,
      lastId,
      startTime
    });
  }

  return { matched, updated: dryRun ? 0 : updated };
}

/**
 * 按指定时间后的最新已发布版本刷新 apps.publishedResourceRefs。
 * 没有命中新版发布记录的应用不会被写入，避免误改功能发布前的历史数据。
 */
async function backfillPublishedResourceRefs({
  dryRun,
  batchSize,
  startTime
}: {
  dryRun: boolean;
  batchSize: number;
  startTime: Date;
}): Promise<MigrationStats> {
  let lastId: string | undefined;
  let scanned = 0;
  let matched = 0;
  let updated = 0;

  while (true) {
    const apps = await MongoApp.find(
      {
        ...(lastId ? { _id: { $gt: new Types.ObjectId(lastId) } } : {}),
        type: { $nin: AppFolderTypeList },
        deleteTime: null,
        updateTime: { $gte: startTime }
      },
      '_id'
    )
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (apps.length === 0) break;

    scanned += apps.length;
    lastId = String(apps[apps.length - 1]._id);

    const latestPublishedVersions = await MongoAppVersion.aggregate<{
      _id: Types.ObjectId;
      nodes?: StoreNodeItemType[];
    }>([
      {
        $match: {
          appId: { $in: apps.map((app) => new Types.ObjectId(String(app._id))) },
          isPublish: true,
          time: { $gte: startTime }
        }
      },
      {
        $sort: {
          appId: 1,
          time: -1,
          _id: -1
        }
      },
      {
        $group: {
          _id: '$appId',
          nodes: { $first: '$nodes' }
        }
      }
    ]);

    const resourceRefsByAppId = new Map<string, AppResourceRefsType>(
      latestPublishedVersions.map((version) => [
        String(version._id),
        extractAppResourceRefsFromNodes(version.nodes ?? [])
      ])
    );

    const operations = latestPublishedVersions.map((version) => ({
      updateOne: {
        filter: { _id: version._id },
        update: {
          $set: {
            publishedResourceRefs: resourceRefsByAppId.get(String(version._id)) ?? { skillIds: [] }
          }
        }
      }
    }));

    matched += operations.length;

    if (!dryRun && operations.length > 0) {
      const result = await MongoApp.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount + result.upsertedCount;
    }

    logger.info('[published resource refs] backfill progress', {
      scanned,
      matched,
      updated: dryRun ? 0 : updated,
      lastId,
      startTime
    });
  }

  return { matched, updated: dryRun ? 0 : updated };
}

async function handler(
  req: ApiRequestProps<undefined, z.input<typeof QuerySchema>>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  const { dryRun, batchSize, startTime } = parseApiInput({
    req,
    querySchema: QuerySchema
  }).query;

  logger.info('Start app resource refs backfill', { dryRun, batchSize, startTime });

  const versions = await backfillVersionResourceRefs({ dryRun, batchSize, startTime });
  const apps = await backfillPublishedResourceRefs({ dryRun, batchSize, startTime });

  logger.info('Finish app resource refs backfill', {
    dryRun,
    batchSize,
    startTime,
    versions,
    apps
  });

  return {
    message: 'Completed app resource refs backfill',
    dryRun,
    batchSize,
    startTime: startTime.toISOString(),
    versions,
    apps
  };
}

export default NextAPI(handler);
