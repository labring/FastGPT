import { getConfiguredDbRuntime } from '@fastgpt/dal/db/runtime';
import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../logger';
import type { Mongoose } from 'mongoose';
import { serviceEnv } from '../../env';
import { configureMongoDalRuntime } from './dalRuntime';
import { connectionMongo } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

const ensureDefaultMongoDalRuntime = (db: Mongoose, url: string) => {
  if (db === connectionMongo && getConfiguredDbRuntime() === undefined && url.trim().length > 0) {
    configureMongoDalRuntime({ mainWriteUrl: url });
  }
};

/**
 * connect MongoDB and init data
 */
export async function connectMongo(props: {
  db: Mongoose;
  url: string;
  connectedCb?: () => void;
}): Promise<Mongoose> {
  const { db, url, connectedCb } = props;

  /* Connecting, connected will return */
  if (db.connection.readyState !== 0) {
    ensureDefaultMongoDalRuntime(db, url);
    return db;
  }

  const RemoveListeners = () => {
    db.connection.removeAllListeners('error');
    db.connection.removeAllListeners('disconnected');
  };

  logger.info('Starting MongoDB connection');
  try {
    // Remove existing listeners to prevent duplicates
    RemoveListeners();
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
    connectedCb?.();

    return db;
  } catch (error) {
    logger.error('MongoDB connection failed, will retry', { error });

    await db.disconnect();

    await delay(1000);
    return connectMongo(props);
  }
}

/**
 * 使用独立无 socket 超时限制（`socketTimeoutMS: 0`）的临时连接执行大表 DDL/建索引操作，
 * 避免与业务查询池共用 60s `socketTimeoutMS` 导致大表建索引中途客户端断开重试。
 */
export async function withMongoDdlConnection<T>({
  url,
  execute
}: {
  url: string;
  execute: (ddlDb: Mongoose) => Promise<T>;
}): Promise<T> {
  const { Mongoose: MongooseCtor } = await import('mongoose');
  const ddlDb = new MongooseCtor();
  ddlDb.set('strictQuery', 'throw');
  ddlDb.set('autoIndex', false);

  await ddlDb.connect(url, {
    bufferCommands: true,
    maxPoolSize: 2,
    minPoolSize: 0,
    connectTimeoutMS: 60000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 0,
    retryWrites: true,
    retryReads: true
  });

  try {
    return await execute(ddlDb);
  } finally {
    await ddlDb.disconnect().catch(() => undefined);
  }
}
