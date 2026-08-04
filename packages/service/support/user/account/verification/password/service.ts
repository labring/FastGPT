import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { verification, VerificationMaterialError } from '../../../../tmpData/verification';
import { MongoUser } from '../../../schema';
import { serviceEnv } from '../../../../../env';
import {
  assertPasswordVerificationConsumeFrequency,
  assertPasswordVerificationCreateFrequency
} from '../utils';
import type {
  IssuePreLoginCodeParams,
  IssuePreLoginCodeResult,
  PasswordVerificationDependencies,
  PasswordVerificationHandler,
  VerifyPasswordCredentialsParams
} from './type';

const defaultDependencies: PasswordVerificationDependencies = {
  generateCode: getNanoid,
  assertCreateFrequency: ({ account, scene }) =>
    assertPasswordVerificationCreateFrequency({
      account,
      scene,
      seconds: serviceEnv.PASSWORD_LOGIN_LOCK_SECONDS
    }),
  assertConsumeFrequency: ({ account, scene }) =>
    assertPasswordVerificationConsumeFrequency({
      account,
      scene,
      seconds: serviceEnv.PASSWORD_LOGIN_LOCK_SECONDS
    }),
  savePreLoginCode: ({ purpose, username, code, ttlPreset }) =>
    verification.upsert({
      scene: purpose,
      type: 'password',
      key: username,
      data: { preLoginCode: code },
      ttlPreset
    }),
  findUserByCredentials: ({ username, password, session }) => {
    const query = MongoUser.findOne({ username, password });
    if (session) query.session(session);
    return query;
  },
  consumeInTransaction: verification.consumeInTransaction
};

/**
 * 只负责预登录验证码和用户名密码匹配，并返回匹配到的用户。
 * forbidden、WeCom 账号限制以及团队、Session、Cookie 等登录策略由业务层负责。
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
    await this.dependencies.assertCreateFrequency({ account: username, scene: purpose });

    const code = this.dependencies.generateCode(6);

    await this.dependencies.savePreLoginCode({
      username,
      code,
      purpose,
      ttlPreset: 'short'
    });

    return { code };
  }

  /** 在同一事务内完成凭据校验、业务回调和预登录材料消费。 */
  async withVerifiedCredentials<T>(
    params: VerifyPasswordCredentialsParams,
    handler: PasswordVerificationHandler<T>
  ) {
    await this.dependencies.assertConsumeFrequency({
      account: params.username,
      scene: params.purpose
    });

    try {
      return await this.dependencies.consumeInTransaction(
        {
          scene: params.purpose,
          type: 'password',
          key: params.username,
          match: { preLoginCode: params.code }
        },
        async ({ session }) => {
          const user = await this.dependencies.findUserByCredentials({
            username: params.username,
            password: params.password,
            session
          });
          if (!user) {
            return Promise.reject(UserErrEnum.account_psw_error);
          }

          return handler({ user, session });
        }
      );
    } catch (error) {
      if (error instanceof VerificationMaterialError) {
        return Promise.reject(new UserError(UserErrEnum.invalidVerificationCode));
      }
      throw error;
    }
  }
}

export const passwordVerificationService = new PasswordVerificationService();
