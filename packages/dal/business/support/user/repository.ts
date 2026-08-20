import type { FastGPTSemType } from '@fastgpt/global/support/marketing/type';
import type { ExpectedState } from '../../../db';
import type { EntityId } from '../../../db/types';
import type { TransactionContext } from '../../../db/transaction';
import type { CreateUser, UpdateUser, UserCredentials } from './dto';
import type { User } from './entity';

export type UserRepository = {
  findById(id: EntityId, context?: TransactionContext): Promise<User | null>;
  findByUsername(username: string, context?: TransactionContext): Promise<User | null>;
  findIdByUsername(username: string, context?: TransactionContext): Promise<string | null>;
  findPasswordUpdateTimeById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<{ passwordUpdateTime?: Date } | null>;
  /** 仅投影 fastgpt_sem，供 CRM 营销归因读取；不返回完整文档。 */
  findSemById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<{ fastgpt_sem?: FastGPTSemType } | null>;
  findByCredentials(
    credentials: UserCredentials,
    context?: TransactionContext
  ): Promise<User | null>;
  create(input: CreateUser, context?: TransactionContext): Promise<User>;
  updateById(id: EntityId, patch: UpdateUser, context?: TransactionContext): Promise<User | null>;
  /** 仅当记录仍符合 expected 时更新，记录存在但状态不匹配时抛出 DB_CONFLICT。 */
  updateByIdIfState(
    id: EntityId,
    expected: ExpectedState<User>,
    patch: UpdateUser,
    context?: TransactionContext
  ): Promise<User | null>;
};
