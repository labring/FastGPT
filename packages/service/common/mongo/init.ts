import type { MongoCollectionDefinition } from '@fastgpt/dal/db/mongo/collection';
import {
  syncMongoCollectionIndexes,
  type MongoIndexSyncReport
} from '@fastgpt/dal/db/mongo/indexSync';
import { withMongoDdlConnection } from '@fastgpt/dal/db/mongo/runtime';
import { coreMongoCollections } from '@fastgpt/dal/db/repos/registry';
import { getConfiguredDbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbDatasource } from '@fastgpt/dal/db/types';
import { delay } from '@fastgpt/global/common/system/utils';
import type { Mongoose } from 'mongoose';
import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../logger';
import { configureMongoDalRuntime } from './dalRuntime';
import { connectionLogMongo, connectionMongo, hasSeparateMongoLogUri } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

/** 针对同一 Mongoose 实例的并发连接去重表，避免 shared 模式下双处并发 connect 打开双池或竞态。 */
const inFlightConnections = new WeakMap<Mongoose, Promise<Mongoose>>();
const inFlightDalIndexSyncs = new Map<string, Promise<MongoIndexSyncReport | undefined>>();
const completedDalIndexSyncs = new Set<string>();

const ensureDefaultMongoDalRuntime = (db: Mongoose, url: string) => {
  if (db === connectionMongo && getConfiguredDbRuntime() === undefined && url.trim().length > 0) {
    configureMongoDalRuntime({ mainWriteUrl: url });
  }
};

const shouldSyncDalIndexesOnConnect = (explicitFlag?: boolean): boolean => {
  if (explicitFlag !== undefined) {
    return explicitFlag;
  }
  return process.env.NODE_ENV !== 'test' && process.env.NEXT_PHASE !== 'phase-production-build';
};

const resolveDalIndexSyncDatasources = (db: Mongoose): readonly DbDatasource[] => {
  const runtime = getConfiguredDbRuntime();
  const isSeparate =
    runtime !== undefined ? runtime.hasSeparateLogDatabase() : hasSeparateMongoLogUri;

  if (!isSeparate) {
    return ['main', 'log'];
  }
  if (db === connectionLogMongo && connectionLogMongo !== connectionMongo) {
    return ['log'];
  }
  return ['main'];
};

export type SyncDalMongoIndexesOptions = {
  url: string;
  dbName?: string;
  datasources?: readonly DbDatasource[];
  collections?: readonly MongoCollectionDefinition<any>[];
  allowCollModTtl?: boolean;
  /** 跳过进程级已完成去重缓存，显式重新触发同步（用于运维命令或隔离单测）。 */
  force?: boolean;
};

/**
 * 使用独立无 `socketTimeoutMS` 超时限制的 DDL 连接异步执行 `@fastgpt/dal` Mongo 集合只增补建索引同步。
 *
 * - 按 `(url, dbName, datasources)` 进行进程级进行中/已完成去重，避免重复建连；
 * - 目标数据源无声明集合时直接短路，不打开空 DDL 连接；
 * - 若本次同步存在错误，不写入已完成缓存，允许后续重连或显式重试。
 */
export const syncDalMongoIndexesWithDdl = async ({
  url,
  dbName,
  datasources,
  collections = coreMongoCollections,
  allowCollModTtl = false,
  force = false
}: SyncDalMongoIndexesOptions): Promise<MongoIndexSyncReport | undefined> => {
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return undefined;
  }

  const targetCollections =
    datasources === undefined
      ? collections
      : collections.filter((col) => datasources.includes(col.datasource));
  if (targetCollections.length === 0) {
    return undefined;
  }

  const useProcessDedupe = !force && collections === coreMongoCollections;
  const dsKey = datasources === undefined ? 'all' : [...datasources].sort().join(',');
  const normalizedDbName = dbName?.trim() ?? '';
  const dedupeKey = `${trimmedUrl}::${normalizedDbName}::${dsKey}`;

  if (useProcessDedupe) {
    if (completedDalIndexSyncs.has(dedupeKey)) {
      return undefined;
    }
    const existing = inFlightDalIndexSyncs.get(dedupeKey);
    if (existing !== undefined) {
      return existing;
    }
  }

  const task = withMongoDdlConnection({
    url: trimmedUrl,
    ...(normalizedDbName.length > 0 ? { dbName: normalizedDbName } : {}),
    execute: (ddlDb) =>
      syncMongoCollectionIndexes({
        client: ddlDb,
        collections: targetCollections,
        allowCollModTtl,
        logger
      })
  }).then((report) => {
    if (report.created.length > 0 || report.ttlUpdated.length > 0) {
      logger.info('DAL MongoDB collection indexes synchronized', {
        datasources: dsKey,
        created: report.created.length,
        ttlUpdated: report.ttlUpdated.length,
        skippedExisting: report.skippedExisting.length
      });
    }
    if (report.optionDriftWarnings.length > 0) {
      logger.warn('DAL MongoDB collection indexes have option drift warnings', {
        datasources: dsKey,
        warnings: report.optionDriftWarnings
      });
    }
    if (report.errors.length > 0) {
      logger.error('DAL MongoDB collection index sync completed with errors', {
        datasources: dsKey,
        errors: report.errors
      });
    } else if (useProcessDedupe) {
      completedDalIndexSyncs.add(dedupeKey);
    }
    return report;
  });

  if (useProcessDedupe) {
    inFlightDalIndexSyncs.set(dedupeKey, task);
  }

  try {
    return await task;
  } finally {
    if (useProcessDedupe && inFlightDalIndexSyncs.get(dedupeKey) === task) {
      inFlightDalIndexSyncs.delete(dedupeKey);
    }
  }
};

const scheduleDalMongoIndexSync = ({
  db,
  url,
  syncDalIndexes
}: {
  db: Mongoose;
  url: string;
  syncDalIndexes?: boolean;
}): void => {
  if (!shouldSyncDalIndexesOnConnect(syncDalIndexes) || url.trim().length === 0) {
    return;
  }
  // 仅对进程共享主库/日志库连接自动触发；独立临时连接除非显式传入 syncDalIndexes: true 才触发。
  if (syncDalIndexes !== true && db !== connectionMongo && db !== connectionLogMongo) {
    return;
  }

  const datasources = resolveDalIndexSyncDatasources(db);
  const dbName = db.connection.name || undefined;

  void syncDalMongoIndexesWithDdl({
    url,
    dbName,
    datasources
  }).catch((error) => {
    logger.error('Failed to sync DAL MongoDB collection indexes on startup', {
      datasources,
      error
    });
  });
};

/**
 * 连接 MongoDB、按需初始化默认 DAL Runtime，并在非测试/非构建环境下通过独立 DDL 连接
 * 后台异步触发 `@fastgpt/dal` 集合的只增补建索引同步。
 */
export async function connectMongo(props: {
  db: Mongoose;
  url: string;
  connectedCb?: () => void;
  /** 显式覆盖是否触发 DAL 集合后台 DDL 索引同步（默认生产运行开启，test 与 build 阶段关闭）。 */
  syncDalIndexes?: boolean;
}): Promise<Mongoose> {
  const { db, url, connectedCb, syncDalIndexes } = props;

  // 1. 同一 Mongoose 实例并发调用 connectMongo 时共享同一个进行中 Promise，避免竞态与双池。
  const existingInFlight = inFlightConnections.get(db);
  if (existingInFlight !== undefined) {
    return existingInFlight;
  }

  // 2. 已建立连接时直接幂等返回，补齐默认 Runtime 与后台 DAL 索引同步登记。
  if (db.connection.readyState !== 0) {
    ensureDefaultMongoDalRuntime(db, url);
    scheduleDalMongoIndexSync({ db, url, syncDalIndexes });
    return db;
  }

  const removeListeners = () => {
    db.connection.removeAllListeners('error');
    db.connection.removeAllListeners('disconnected');
  };

  // 3. 在单个 Promise 内执行失败退避重试，避免递归重入外层 connectMongo 命中 inFlightConnections 造成自死锁。
  const connectPromise = (async (): Promise<Mongoose> => {
    while (true) {
      logger.info('Starting MongoDB connection');
      try {
        removeListeners();
        db.set('strictQuery', 'throw');
        // 禁用 Mongoose 隐式自动建索引，统一交由 MongoIndexManager / DAL 索引同步器显式管理，避免双重竞态。
        db.set('autoIndex', false);

        db.connection.on('error', async (error) => {
          logger.error('MongoDB connection error', {
            error,
            readyState: db.connection.readyState
          });
        });
        db.connection.on('connected', async () => {
          logger.info('MongoDB connected successfully');
        });
        db.connection.on('disconnected', async () => {
          logger.warn('MongoDB disconnected');
        });

        await db.connect(url, {
          bufferCommands: true,
          maxConnecting: serviceEnv.DB_MAX_LINK, // 最大连接数: 防止连接数过多时无法满足需求
          maxPoolSize: serviceEnv.DB_MAX_LINK, // 最大连接池大小: 防止连接池过大时无法满足需求
          minPoolSize: 1,
          connectTimeoutMS: 60000, // 连接超时: 60秒,防止连接失败时长时间阻塞
          waitQueueTimeoutMS: 60000, // 等待队列超时: 60秒,防止等待队列长时间阻塞
          socketTimeoutMS: 60000, // Socket 超时: 60秒,防止Socket连接失败时长时间阻塞
          maxIdleTimeMS: 300000, // 空闲连接超时: 5分钟,防止空闲连接长时间占用资源
          retryWrites: true, // 重试写入: 重试写入失败的操作
          retryReads: true, // 重试读取: 重试读取失败的操作
          serverSelectionTimeoutMS: 10000, // 服务器选择超时: 10秒,防止副本集故障时长时间阻塞
          heartbeatFrequencyMS: 5000 // 5s 进行一次健康检查
        });

        ensureDefaultMongoDalRuntime(db, url);
        scheduleDalMongoIndexSync({ db, url, syncDalIndexes });
        connectedCb?.();

        return db;
      } catch (error) {
        logger.error('MongoDB connection failed, will retry', { error });

        await db.disconnect().catch(() => undefined);

        await delay(1000);
      }
    }
  })();

  inFlightConnections.set(db, connectPromise);

  try {
    return await connectPromise;
  } finally {
    if (inFlightConnections.get(db) === connectPromise) {
      inFlightConnections.delete(db);
    }
  }
}
