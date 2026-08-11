import { serviceEnv } from '../../../env';
import type { ConnectOptions, Mongoose } from 'mongoose';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.MONGO);

export const createDefaultMongooseConnectOptions = (): ConnectOptions => {
  const maxConnecting = Math.max(5, serviceEnv.DB_MAX_LINK);

  return {
    bufferCommands: true,
    maxConnecting,
    maxPoolSize: maxConnecting,
    minPoolSize: 1,
    connectTimeoutMS: 60_000,
    waitQueueTimeoutMS: 60_000,
    socketTimeoutMS: 60_000,
    maxIdleTimeMS: 300_000,
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: 10_000,
    heartbeatFrequencyMS: 5_000
  };
};

export const registerMongooseListeners = (db: Mongoose) => {
  db.connection.removeAllListeners('error');
  db.connection.removeAllListeners('connected');
  db.connection.removeAllListeners('disconnected');

  db.connection.on('error', (error) => {
    logger.error('DAL MongoDB connection error', { error, readyState: db.connection.readyState });
  });
  db.connection.on('connected', () => logger.info('DAL MongoDB connected successfully'));
  db.connection.on('disconnected', () => logger.warn('DAL MongoDB disconnected'));
};
