import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { addSeconds } from 'date-fns';
import { addAuthCode, authCode } from '../../../auth/controller';
import { MongoUser } from '../../../schema';
import type {
  IssuePreLoginCodeParams,
  IssuePreLoginCodeResult,
  PasswordVerificationDependencies,
  VerifyPasswordCredentialsParams
} from './type';

const defaultDependencies: PasswordVerificationDependencies = {
  generateCode: getNanoid,
  now: () => new Date(),
  savePreLoginCode: ({ username, code, expiredTime }) =>
    addAuthCode({
      type: UserAuthTypeEnum.login,
      key: username,
      code,
      expiredTime
    }),
  verifyPreLoginCode: ({ username, code }) =>
    authCode({
      key: username,
      code,
      type: UserAuthTypeEnum.login
    }),
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

  async issuePreLoginCode({ username }: IssuePreLoginCodeParams): Promise<IssuePreLoginCodeResult> {
    const code = this.dependencies.generateCode(6);

    await this.dependencies.savePreLoginCode({
      username,
      code,
      expiredTime: addSeconds(this.dependencies.now(), 30)
    });

    return { code };
  }

  async verifyCredentials({ username, password, code }: VerifyPasswordCredentialsParams) {
    await this.dependencies.verifyPreLoginCode({ username, code });

    const user = await this.dependencies.findUserByCredentials({ username, password });
    if (!user) {
      return Promise.reject(UserErrEnum.account_psw_error);
    }

    return user;
  }
}

export const passwordVerificationService = new PasswordVerificationService();
