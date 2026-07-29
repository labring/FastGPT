import type { HydratedDocument } from 'mongoose';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';

export type PasswordVerificationUser = HydratedDocument<UserModelSchema>;

export type IssuePreLoginCodeParams = {
  username: string;
};

export type IssuePreLoginCodeResult = {
  code: string;
};

export type VerifyPasswordCredentialsParams = {
  username: string;
  password: string;
  code: string;
};

export type PasswordVerificationDependencies = {
  generateCode: (length: number) => string;
  now: () => Date;
  savePreLoginCode: (params: {
    username: string;
    code: string;
    expiredTime: Date;
  }) => Promise<unknown>;
  verifyPreLoginCode: (params: { username: string; code: string }) => Promise<unknown>;
  findUserByCredentials: (params: {
    username: string;
    password: string;
  }) => Promise<PasswordVerificationUser | null>;
};
