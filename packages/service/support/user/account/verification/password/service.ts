import { addSeconds } from 'date-fns';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { AccountVerificationMaterialTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import type { AccountVerificationPurpose } from '@fastgpt/global/support/user/account/verification/type';
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
  {
    username: string;
    materialKey?: string;
    materialType?: `${AccountVerificationMaterialTypeEnum}`;
    userIdHash?: string;
    purpose?: AccountVerificationPurpose;
  },
  { code: string },
  {
    username: string;
    password: string;
    code: string;
    materialKey?: string;
    materialType?: `${AccountVerificationMaterialTypeEnum}`;
    userIdHash?: string;
    purpose?: AccountVerificationPurpose;
  },
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

  async create({
    username,
    materialKey = username,
    materialType = AccountVerificationMaterialTypeEnum.login,
    userIdHash,
    purpose = 'login'
  }: {
    username: string;
    materialKey?: string;
    materialType?: `${AccountVerificationMaterialTypeEnum}`;
    userIdHash?: string;
    purpose?: AccountVerificationPurpose;
  }) {
    const code = this.dependencies.generateCode();
    const now = this.dependencies.now();

    await upsertVerificationMaterial({
      key: materialKey,
      type: materialType,
      code,
      userIdHash,
      purpose,
      createTime: now,
      expiredTime: addSeconds(now, 30)
    });

    return { code };
  }

  async consume({
    username,
    password,
    code,
    materialKey = username,
    materialType = AccountVerificationMaterialTypeEnum.login,
    userIdHash,
    purpose = 'login'
  }: {
    username: string;
    password: string;
    code: string;
    materialKey?: string;
    materialType?: `${AccountVerificationMaterialTypeEnum}`;
    userIdHash?: string;
    purpose?: AccountVerificationPurpose;
  }): Promise<LocalAccountIdentity> {
    const material = await consumeVerificationMaterial({
      key: materialKey,
      type: materialType,
      code,
      userIdHash,
      purpose,
      caseInsensitiveCode: true,
      now: this.dependencies.now()
    });
    if (!material) {
      throw new UserError(UserErrEnum.invalidVerificationCode);
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
