import type { DatabaseAdapter } from '@fastgpt/dal/db';
import { serviceEnv } from '../../env';
import { createMongoAdapter } from './mongo';

export type { DatabaseAdapter } from '@fastgpt/dal/db';
export type {
  GroupRepository,
  OrgRepository,
  TeamRepository,
  TmpDataRepository,
  UserRepository
} from '@fastgpt/dal/business';
export type { TransactionContext, TransactionRunner } from '@fastgpt/dal/db';

function selectAdapter(): DatabaseAdapter {
  // env schema 默认 mongo；被 mock 的 serviceEnv 可能缺少该字段，这里保持同样的默认语义。
  switch (serviceEnv.DAL_DB_TYPE ?? 'mongo') {
    case 'mongo': {
      return createMongoAdapter();
    }

    default: {
      throw new Error(`DAL_DB_TYPE=${serviceEnv.DAL_DB_TYPE} is not implemented yet`);
    }
  }
}

// 只实例化一次 adapter，保证 userRepository 与 transactionRunner 来自同一个 adapter 实例。
const dal = selectAdapter();

export const {
  transactionRunner,
  userRepository,
  teamRepository,
  groupRepository,
  orgRepository,
  tmpDataRepository
} = dal;
