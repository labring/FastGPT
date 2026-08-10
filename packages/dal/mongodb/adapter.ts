import mongoose, { type Mongoose } from 'mongoose';
import type { DatabaseAdapter } from '../db';
import type { DatabaseErrorAdapter } from '../db';
import { MongoErrorAdapter } from './errors';
import { createMongoUserRepository } from './repositories/user';
import { MongoTransactionRunner } from './transaction';

export type MongoAdapterDependencies = {
  client?: Mongoose;
  errorAdapter?: DatabaseErrorAdapter;
};

/** MongoDB adapter，保证所有仓储和事务共享同一个 Mongoose client。 */
export class MongoAdapter implements DatabaseAdapter {
  readonly userRepository;
  readonly transactionRunner;
  readonly errorAdapter;

  constructor({
    client = mongoose,
    errorAdapter = new MongoErrorAdapter()
  }: MongoAdapterDependencies = {}) {
    this.errorAdapter = errorAdapter;
    this.userRepository = createMongoUserRepository(client, errorAdapter);
    this.transactionRunner = new MongoTransactionRunner(client, errorAdapter);
  }
}
