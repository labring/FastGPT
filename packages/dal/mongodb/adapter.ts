import mongoose, { type Mongoose } from 'mongoose';
import type { DatabaseAdapter } from '../db';
import type { DatabaseErrorAdapter } from '../db';
import { MongoErrorAdapter } from './errors';
import { createMongoUserRepository } from './business/support/user/repository';
import { createMongoTeamRepository } from './business/support/user/team/repository';
import { createMongoGroupRepository } from './business/support/user/team/group/repository';
import { createMongoOrgRepository } from './business/support/user/team/org/repository';
import { createMongoTmpDataRepository } from './business/support/user/verification/repository';
import { MongoTransactionRunner } from './transaction';

export type MongoAdapterDependencies = {
  client?: Mongoose;
  errorAdapter?: DatabaseErrorAdapter;
};

/** MongoDB adapter，保证所有仓储和事务共享同一个 Mongoose client。 */
export class MongoAdapter implements DatabaseAdapter {
  readonly userRepository;
  readonly teamRepository;
  readonly groupRepository;
  readonly orgRepository;
  readonly tmpDataRepository;
  readonly transactionRunner;
  readonly errorAdapter;

  constructor({
    client = mongoose,
    errorAdapter = new MongoErrorAdapter()
  }: MongoAdapterDependencies = {}) {
    this.errorAdapter = errorAdapter;
    this.userRepository = createMongoUserRepository(client, errorAdapter);
    this.groupRepository = createMongoGroupRepository(client, errorAdapter);
    this.orgRepository = createMongoOrgRepository(client, errorAdapter);
    this.teamRepository = createMongoTeamRepository(client, errorAdapter, {
      groupRepository: this.groupRepository,
      orgRepository: this.orgRepository
    });
    this.tmpDataRepository = createMongoTmpDataRepository(client, errorAdapter);
    this.transactionRunner = new MongoTransactionRunner(client, errorAdapter);
  }
}
