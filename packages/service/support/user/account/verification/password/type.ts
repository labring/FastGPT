import type { HydratedDocument } from 'mongoose';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';

export type PasswordVerificationUser = HydratedDocument<UserModelSchema>;

export type PasswordVerificationPurpose =
  | 'login'
  | 'register'
  | 'forgetPassword'
  | 'changePassword'
  | 'unsubscribe'
  | 'bindNotification';

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

export type PasswordVerificationDependencies = {
  generateCode: (length: number) => string;
  now: () => Date;
  assertConsumeFrequency: (params: {
    account: string;
    scene: PasswordVerificationPurpose;
  }) => Promise<unknown>;
  savePreLoginCode: (params: {
    username: string;
    code: string;
    purpose: PasswordVerificationPurpose;
    expiredTime: Date;
  }) => Promise<unknown>;
  verifyPreLoginCode: (params: {
    username: string;
    code: string;
    purpose: PasswordVerificationPurpose;
  }) => Promise<unknown>;
  findUserByCredentials: (params: {
    username: string;
    password: string;
  }) => Promise<PasswordVerificationUser | null>;
};
