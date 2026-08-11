import type { CreateUser, UpdateUser, User, UserCredentials } from '../domain/user';
import type { EntityId } from '../domain/types';
import type { TransactionContext } from '../transaction';

export type UserRepository = {
  findById(id: EntityId, context?: TransactionContext): Promise<User | null>;
  findByUsername(username: string, context?: TransactionContext): Promise<User | null>;
  findIdByUsername(username: string, context?: TransactionContext): Promise<string | null>;
  findPasswordUpdateTimeById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<{ passwordUpdateTime?: Date } | null>;
  findByCredentials(
    credentials: UserCredentials,
    context?: TransactionContext
  ): Promise<User | null>;
  create(input: CreateUser, context?: TransactionContext): Promise<User>;
  updateById(id: EntityId, patch: UpdateUser, context?: TransactionContext): Promise<User | null>;
};
