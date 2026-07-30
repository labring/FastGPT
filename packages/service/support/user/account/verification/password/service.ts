import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addSeconds } from 'date-fns';
import { verification } from '../../../../tmpData/verification';
import { MongoUser } from '../../../schema';
import { assertCodeVerificationConsumeFrequency } from '../utils';
import type {
  IssuePreLoginCodeParams,
  IssuePreLoginCodeResult,
  PasswordVerificationDependencies,
  VerifyPasswordCredentialsParams
} from './type';

const defaultDependencies: PasswordVerificationDependencies = {
  generateCode: getNanoid,
  now: () => new Date(),
  assertConsumeFrequency: assertCodeVerificationConsumeFrequency,
  savePreLoginCode: ({ purpose, username, code, expiredTime }) =>
    verification.upsert(purpose, 'password', username, { preLoginCode: code }, expiredTime),
  verifyPreLoginCode: async ({ purpose, username, code }) => {
    const material = await verification.consume(purpose, 'password', username, {
      preLoginCode: code
    });

    if (!material) {
      return Promise.reject(new UserError(UserErrEnum.invalidVerificationCode));
    }

    return 'SUCCESS';
  },
  findUserByCredentials: ({ username, password }) => MongoUser.findOne({ username, password })
};

/**
 * 只负责预登录验证码和用户名密码匹配，并返回匹配到的用户。
 * forbidden、WeCom 账号限制以及团队、Session、Cookie 等登录策略由业务层负责。
 * 当前实例尚未接入生产入口。
 */
export class PasswordVerificationService {
  private readonly dependencies: PasswordVerificationDependencies;

  constructor(dependencies: Partial<PasswordVerificationDependencies> = {}) {
    this.dependencies = {
      ...defaultDependencies,
      ...dependencies
    };
  }

  async issuePreLoginCode({
    username,
    purpose
  }: IssuePreLoginCodeParams): Promise<IssuePreLoginCodeResult> {
    const code = this.dependencies.generateCode(6);

    await this.dependencies.savePreLoginCode({
      username,
      code,
      purpose,
      expiredTime: addSeconds(this.dependencies.now(), 30)
    });

    return { code };
  }

  async verifyCredentials({ username, password, code, purpose }: VerifyPasswordCredentialsParams) {
    await this.dependencies.assertConsumeFrequency({ account: username, scene: purpose });
    await this.dependencies.verifyPreLoginCode({ username, code, purpose });

    const user = await this.dependencies.findUserByCredentials({ username, password });
    if (!user) {
      return Promise.reject(UserErrEnum.account_psw_error);
    }

    return user;
  }
}

export const passwordVerificationService = new PasswordVerificationService();
