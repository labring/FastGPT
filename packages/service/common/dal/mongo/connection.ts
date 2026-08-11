import { Mongoose } from 'mongoose';
import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../logger';
import { serviceEnv } from '../../../env';
import { createDefaultMongooseConnectOptions, registerMongooseListeners } from './config';

const logger = getLogger(LogCategories.INFRA.MONGO);

export class MongooseConnection {
  private readonly mongoose: Mongoose;

  constructor() {
    this.mongoose = new Mongoose();
  }

  get client(): Mongoose {
    return this.mongoose;
  }

  async connect(url: string = serviceEnv.MONGODB_URI): Promise<Mongoose> {
    const db = this.mongoose;

    if (db.connection.readyState !== 0) {
      return db;
    }

    db.set('strictQuery', 'throw');

    registerMongooseListeners(db);

    try {
      const options = createDefaultMongooseConnectOptions();
      await db.connect(url, {
        ...options
      });
      return db;
    } catch (error) {
      logger.error('DAL MongoDB connection failed, will retry', { error });
      try {
        await db.disconnect();
      } catch (disconnectError) {
        logger.warn('DAL MongoDB disconnect failed during retry', { error: disconnectError });
      }
      await delay(1000);
      return this.connect(url);
    }
  }

  async disconnect(): Promise<void> {
    if (this.mongoose.connection.readyState !== 0) {
      await this.mongoose.disconnect();
    }
  }
}

export const connection = new MongooseConnection();
