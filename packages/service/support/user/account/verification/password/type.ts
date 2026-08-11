import type { User } from '@fastgpt/dal';
import type { TransactionContext } from '../../../../../common/dal';
import type {
  PasswordVerificationPurpose,
  VerificationTtlPreset,
  VerificationType
} from '@fastgpt/global/support/user/account/verification/type';
import type {
  VerificationConsumeDalContext,
  VerificationConsumeParams
} from '../../../../tmpData/verification';

export type PasswordVerificationUser = User;

export type { PasswordVerificationPurpose } from '@fastgpt/global/support/user/account/verification/type';

export type IssuePreLoginCodeParams = {
  username: string;
  purpose: PasswordVerificationPurpose;
};

export type IssuePreLoginCodeResult = {
  code: string;
};

export type VerifyPasswordCredentialsParams = {
  username: string;
  password: string;
  code: string;
  purpose: PasswordVerificationPurpose;
};

export type PasswordVerificationHandler<T> = (params: {
  user: PasswordVerificationUser;
  dalContext: TransactionContext;
}) => Promise<T>;

export type PasswordVerificationDependencies = {
  generateCode: (length: number) => string;
  assertCreateFrequency: (params: {
    account: string;
    scene: PasswordVerificationPurpose;
  }) => Promise<unknown>;
  assertConsumeFrequency: (params: {
    account: string;
    scene: PasswordVerificationPurpose;
  }) => Promise<unknown>;
  savePreLoginCode: (params: {
    username: string;
    code: string;
    purpose: PasswordVerificationPurpose;
    ttlPreset: VerificationTtlPreset;
  }) => Promise<unknown>;
  findUserByCredentials: (params: {
    username: string;
    password: string;
  }) => Promise<PasswordVerificationUser | null>;
  consumeInTransaction: <T extends VerificationType, R>(
    params: VerificationConsumeParams<T>,
    handler: (context: VerificationConsumeDalContext<T>) => Promise<R>
  ) => Promise<R>;
};
