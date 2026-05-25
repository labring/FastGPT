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
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const logger = getLogger(['backfillAppResourceRefs']);

const QuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
  batchSize: z.coerce.number().int().min(1).max(2000).optional().default(500)
});

type MigrationStats = {
  matched: number;
  updated: number;
};

type ResponseType = {
  message: string;
  dryRun: boolean;
  batchSize: number;
  versions: MigrationStats;
  apps: MigrationStats;
};

/**
 * 回填历史 app_versions.resourceRefs，保证旧版本记录也具备统一的资源引用索引。
 */
async function backfillVersionResourceRefs({
  dryRun,
  batchSize
}: {
  dryRun: boolean;
  batchSize: number;
}): Promise<MigrationStats> {
  let lastId: string | undefined;
  let scanned = 0;
  let matched = 0;
  let updated = 0;

  while (true) {
    const versions = await MongoAppVersion.find(
      lastId ? { _id: { $gt: new Types.ObjectId(lastId) } } : {},
      '_id nodes resourceRefs'
    )
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (versions.length === 0) break;

    scanned += versions.length;
    lastId = String(versions[versions.length - 1]._id);

    const versionsToUpdate = versions.filter((v) => !v.resourceRefs || !v.resourceRefs.skillIds);

    matched += versionsToUpdate.length;

    const operations = versionsToUpdate.map((version) => ({
      updateOne: {
        filter: { _id: version._id },
        update: {
          $set: {
            resourceRefs: extractAppResourceRefsFromNodes(version.nodes)
          }
        }
      }
    }));

    if (!dryRun && operations.length > 0) {
      const result = await MongoAppVersion.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount + result.upsertedCount;
    }

    logger.info('[version resource refs] backfill progress', {
      scanned,
      matched,
      updated: dryRun ? 0 : updated,
      lastId
    });
  }

  return { matched, updated: dryRun ? 0 : updated };
}

/**
 * 按每个应用最新的已发布版本刷新 apps.publishedResourceRefs。
 */
async function backfillPublishedResourceRefs({
  dryRun,
  batchSize
}: {
  dryRun: boolean;
  batchSize: number;
}): Promise<MigrationStats> {
  let lastId: string | undefined;
  let matched = 0;
  let updated = 0;

  while (true) {
    const apps = await MongoApp.find(
      {
        ...(lastId ? { _id: { $gt: new Types.ObjectId(lastId) } } : {}),
        type: { $nin: AppFolderTypeList },
        deleteTime: null
      },
      '_id'
    )
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (apps.length === 0) break;

    matched += apps.length;
    lastId = String(apps[apps.length - 1]._id);

    const latestPublishedVersions = await MongoAppVersion.aggregate<{
      _id: Types.ObjectId;
      nodes?: StoreNodeItemType[];
    }>([
      {
        $match: {
          appId: { $in: apps.map((app) => new Types.ObjectId(String(app._id))) },
          isPublish: true
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

    const operations = apps.map((app) => ({
      updateOne: {
        filter: { _id: app._id },
        update: {
          $set: {
            publishedResourceRefs: resourceRefsByAppId.get(String(app._id)) ?? { skillIds: [] }
          }
        }
      }
    }));

    if (!dryRun && operations.length > 0) {
      const result = await MongoApp.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount + result.upsertedCount;
    }

    logger.info('[published resource refs] backfill progress', {
      scanned: matched,
      updated: dryRun ? 0 : updated,
      lastId
    });
  }

  return { matched, updated: dryRun ? 0 : updated };
}

async function handler(
  req: ApiRequestProps<undefined, z.input<typeof QuerySchema>>,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  const { dryRun, batchSize } = parseApiInput({ req, querySchema: QuerySchema }).query;

  logger.info('Start app resource refs backfill', { dryRun, batchSize });

  const versions = await backfillVersionResourceRefs({ dryRun, batchSize });
  const apps = await backfillPublishedResourceRefs({ dryRun, batchSize });

  logger.info('Finish app resource refs backfill', { dryRun, batchSize, versions, apps });

  return {
    message: 'Completed app resource refs backfill',
    dryRun,
    batchSize,
    versions,
    apps
  };
}

export default NextAPI(handler);
