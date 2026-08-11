import { MongoAdapter } from '@fastgpt/dal/mongodb';
import type { DatabaseAdapter } from '@fastgpt/dal/db';
import type { Mongoose } from 'mongoose';
import { connection } from './connection';

export const createMongoDal = (client: Mongoose = connection.client): DatabaseAdapter => {
  return new MongoAdapter({ client });
};
