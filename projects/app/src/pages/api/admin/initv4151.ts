import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/types';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getLogger } from '@fastgpt/service/common/logger';
import { Types, type AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';

const logger = getLogger(['initv4151']);
const BATCH_SIZE = 500;

export type ResponseType = {
  message: string;
  scannedRecords: number;
  updatedRecords: number;
  skippedInvalidAppId: number;
  skippedMissingApp: number;
};

type OpenApiAppNameMigrationItem = Pick<OpenApiSchema, '_id' | 'appId' | 'appName'>;

/**
 * 为历史应用级 API Key 回填应用名快照。
 *
 * 只处理有 appId 且 appName 为空的记录，避免覆盖已经生成过的历史展示值。
 */
export async function migrateOpenApiAppNames(): Promise<Omit<ResponseType, 'message'>> {
  let lastId: string | undefined;
  let scannedRecords = 0;
  let updatedRecords = 0;
  let skippedInvalidAppId = 0;
  let skippedMissingApp = 0;

  while (true) {
    const openApis = (await MongoOpenApi.find(
      {
        ...(lastId
          ? {
              _id: {
                $gt: lastId
              }
            }
          : {}),
        appId: {
          $exists: true,
          $nin: ['', null]
        },
        $or: [{ appName: { $exists: false } }, { appName: '' }, { appName: null }]
      },
      {
        _id: 1,
        appId: 1,
        appName: 1
      }
    )
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean()) as OpenApiAppNameMigrationItem[];

    if (openApis.length === 0) {
      break;
    }

    scannedRecords += openApis.length;
    lastId = String(openApis[openApis.length - 1]._id);

    const validAppIds = Array.from(
      new Set(
        openApis.flatMap((item) => {
          const appId = String(item.appId || '');
          if (!Types.ObjectId.isValid(appId)) {
            skippedInvalidAppId += 1;
            return [];
          }
          return [appId];
        })
      )
    );

    if (validAppIds.length === 0) {
      continue;
    }

    const apps = await MongoApp.find(
      {
        _id: {
          $in: validAppIds
        }
      },
      {
        _id: 1,
        name: 1
      }
    ).lean();
    const appNameMap = new Map(apps.map((app) => [String(app._id), app.name]));

    const ops: AnyBulkWriteOperation<OpenApiSchema>[] = [];

    for (const item of openApis) {
      const appId = String(item.appId || '');
      if (!Types.ObjectId.isValid(appId)) {
        continue;
      }

      const appName = appNameMap.get(appId);
      if (!appName) {
        skippedMissingApp += 1;
        continue;
      }

      ops.push({
        updateOne: {
          filter: {
            _id: item._id,
            $or: [{ appName: { $exists: false } }, { appName: '' }, { appName: null }]
          },
          update: {
            $set: {
              appName
            }
          }
        }
      });
    }

    if (ops.length > 0) {
      const result = await MongoOpenApi.bulkWrite(ops, {
        ordered: false
      });
      updatedRecords += result.modifiedCount;
      logger.info(`[initv4151] Updated ${result.modifiedCount} OpenAPI app names`);
    }
  }

  return {
    scannedRecords,
    updatedRecords,
    skippedInvalidAppId,
    skippedMissingApp
  };
}

/**
 * 4.15.1 版本数据初始化脚本
 * 1. 为历史带 appId 的 API Key 自动生成 appName 展示快照
 */
async function handler(req: ApiRequestProps): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  const result = await migrateOpenApiAppNames();

  return {
    message: `Completed v4.15.1 initialization: Updated ${result.updatedRecords} OpenAPI app names`,
    ...result
  };
}

export default NextAPI(handler);
