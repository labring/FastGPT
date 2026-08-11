import type { DatabaseAdapter } from '@fastgpt/dal/db';
import { serviceEnv } from '../../env';
import { createMongoDal } from './mongo';

export type { DatabaseAdapter } from '@fastgpt/dal/db';
export type { UserRepository } from '@fastgpt/dal/ports';
export type { TransactionContext, TransactionRunner } from '@fastgpt/dal/transaction';

function selectDal() {
  switch (serviceEnv.DAL_DB_TYPE) {
    case 'mongo': {
      return createMongoDal();
    }

    default: {
      throw new Error(`DAL_DB_TYPE=${serviceEnv.DAL_DB_TYPE} is not implemented yet`);
    }
  }
}

function createRepositories() {
  const { errorAdapter: _e, transactionRunner: _t, ...repositories }: DatabaseAdapter = selectDal();

  return {
    ...repositories
  };
}

function createTransactionRunner() {
  const { transactionRunner }: DatabaseAdapter = selectDal();

  return {
    transactionRunner
  };
}

export const { transactionRunner, userRepository } = {
  ...createRepositories(),
  ...createTransactionRunner()
};
