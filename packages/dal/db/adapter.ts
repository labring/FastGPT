import type {
  GroupRepository,
  OrgRepository,
  TeamRepository,
  TmpDataRepository,
  UserRepository
} from '../business/support/user';
import type { TransactionRunner } from './transaction';
import type { DatabaseErrorAdapter } from './error-adapter';

export type DatabaseAdapter = {
  userRepository: UserRepository;
  teamRepository: TeamRepository;
  groupRepository: GroupRepository;
  orgRepository: OrgRepository;
  tmpDataRepository: TmpDataRepository;
  transactionRunner: TransactionRunner;
  errorAdapter: DatabaseErrorAdapter;
};
