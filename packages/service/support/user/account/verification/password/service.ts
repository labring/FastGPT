import { addSeconds } from 'date-fns';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { AccountVerificationMaterialTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import { MongoUser } from '../../../schema';
import { consumeVerificationMaterial, upsertVerificationMaterial } from '../entity';
import { AccountVerification, type LocalAccountIdentity } from '../service';

type PasswordVerificationDependencies = {
  generateCode: () => string;
  now: () => Date;
};

/**
 * 校验预登录材料和本地密码，只返回可信本地身份。
 * Session、团队加载及 Wecom 登录策略由上层登录应用服务负责。
 */
export class PasswordAccountVerification extends AccountVerification<
  { username: string },
  { code: string },
  { username: string; password: string; code: string },
  LocalAccountIdentity
> {
  private readonly dependencies: PasswordVerificationDependencies;

  constructor(dependencies: Partial<PasswordVerificationDependencies> = {}) {
    super();
    this.dependencies = {
      generateCode: () => getNanoid(6),
      now: () => new Date(),
      ...dependencies
    };
  }

  async create({ username }: { username: string }) {
    const code = this.dependencies.generateCode();
    const now = this.dependencies.now();

    await upsertVerificationMaterial({
      key: username,
      type: AccountVerificationMaterialTypeEnum.login,
      code,
      createTime: now,
      expiredTime: addSeconds(now, 30)
    });

    return { code };
  }

  async consume({
    username,
    password,
    code
  }: {
    username: string;
    password: string;
    code: string;
  }): Promise<LocalAccountIdentity> {
    const material = await consumeVerificationMaterial({
      key: username,
      type: AccountVerificationMaterialTypeEnum.login,
      code,
      caseInsensitiveCode: true,
      now: this.dependencies.now()
    });
    if (!material) {
      throw new UserError(i18nT('common:error.code_error'));
    }

    const user = await MongoUser.findOne({ username, password });
    if (!user) {
      return Promise.reject(UserErrEnum.account_psw_error);
    }
    if (user.status === UserStatusEnum.forbidden) {
      return Promise.reject('Invalid account!');
    }

    return {
      kind: 'local',
      userId: String(user._id),
      username: user.username,
      lastLoginTmbId: user.lastLoginTmbId ? String(user.lastLoginTmbId) : undefined,
      isRoot: user.username === 'root'
    };
  }
}

export const passwordAccountVerification = new PasswordAccountVerification();
