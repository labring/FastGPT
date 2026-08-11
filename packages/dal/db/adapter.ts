import type { TeamRepository, TmpDataRepository, UserRepository } from '../ports';
import type { TransactionRunner } from '../transaction';
import type { DatabaseErrorAdapter } from './error-adapter';

export type DatabaseAdapter = {
  userRepository: UserRepository;
  teamRepository: TeamRepository;
  tmpDataRepository: TmpDataRepository;
  transactionRunner: TransactionRunner;
  errorAdapter: DatabaseErrorAdapter;
};
