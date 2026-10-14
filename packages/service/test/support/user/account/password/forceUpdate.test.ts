import { beforeEach, describe, expect, it } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { forceUpdatePassword } from '@fastgpt/service/support/user/account/password/service';
import { MongoUser } from '@fastgpt/service/support/user/schema';

const OLD_PASSWORD = 'old-password';
const NEW_PASSWORD = 'brand-new-password';

describe('forceUpdatePassword', () => {
  let forcedUser: any;
  let normalUser: any;

  beforeEach(async () => {
    forcedUser = await MongoUser.create({
      username: 'force-update-pending',
      password: hashStr(OLD_PASSWORD),
      mustChangePassword: true
    });
    normalUser = await MongoUser.create({
      username: 'force-update-normal',
      password: hashStr(OLD_PASSWORD)
    });
  });

  it('updates the password and clears the flag when a forced change is pending', async () => {
    await forceUpdatePassword({
      userId: String(forcedUser._id),
      newPassword: hashStr(NEW_PASSWORD)
    });

    expect(
      await MongoUser.exists({
        _id: forcedUser._id,
        password: hashStr(NEW_PASSWORD),
        mustChangePassword: false
      })
    ).toBeTruthy();
  });

  it('records passwordUpdateTime', async () => {
    await forceUpdatePassword({
      userId: String(forcedUser._id),
      newPassword: hashStr(NEW_PASSWORD)
    });

    const updated = await MongoUser.findById(forcedUser._id).lean();
    expect(updated?.passwordUpdateTime).toBeInstanceOf(Date);
  });

  it('rejects fail-closed when the account is not in a forced change state', async () => {
    // 攻击面在于「无条件改密」：本函数不校验旧密码，mustChangePassword 标记是唯一授权依据，
    // 一旦放开就会退化成本仓库最宽松的改密通道。
    await expect(
      forceUpdatePassword({
        userId: String(normalUser._id),
        newPassword: hashStr(NEW_PASSWORD)
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);

    expect(
      await MongoUser.exists({ _id: normalUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects a password identical to the current one', async () => {
    await expect(
      forceUpdatePassword({
        userId: String(forcedUser._id),
        newPassword: hashStr(OLD_PASSWORD)
      })
    ).rejects.toThrow(UserErrEnum.newPasswordSameAsOld);

    // 同密被拒后仍应停留在强制改密状态，用户需重新输入新密码。
    expect(await MongoUser.exists({ _id: forcedUser._id, mustChangePassword: true })).toBeTruthy();
  });

  it('rejects a non-existent user', async () => {
    await expect(
      forceUpdatePassword({
        userId: '68a1b2c3d4e5f60718293a4b',
        newPassword: hashStr(NEW_PASSWORD)
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);
  });

  it('cannot be replayed after the flag is cleared', async () => {
    await forceUpdatePassword({
      userId: String(forcedUser._id),
      newPassword: hashStr(NEW_PASSWORD)
    });

    // 标记在首次成功后即被清除，二次调用落到 fail-closed 分支，不能再改一次。
    await expect(
      forceUpdatePassword({
        userId: String(forcedUser._id),
        newPassword: hashStr('another-new-password')
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);

    expect(
      await MongoUser.exists({ _id: forcedUser._id, password: hashStr(NEW_PASSWORD) })
    ).toBeTruthy();
  });
});
