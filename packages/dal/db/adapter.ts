import type { UserRepository } from '../ports';
import type { TransactionRunner } from '../transaction';
import type { DatabaseErrorAdapter } from './error-adapter';

export type DatabaseAdapter = {
  userRepository: UserRepository;
  transactionRunner: TransactionRunner;
  errorAdapter: DatabaseErrorAdapter;
};
