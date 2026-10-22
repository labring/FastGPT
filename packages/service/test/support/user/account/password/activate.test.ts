import { beforeEach, describe, expect, it } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { activateAccount } from '@fastgpt/service/support/user/account/password/service';
import { MongoUser } from '@fastgpt/service/support/user/schema';

const OLD_PASSWORD = 'old-password';
const NEW_PASSWORD = 'brand-new-password';

describe('activateAccount', () => {
  let unactivatedUser: any;
  let activatedUser: any;

  beforeEach(async () => {
    unactivatedUser = await MongoUser.create({
      username: 'activate-pending',
      password: hashStr(OLD_PASSWORD),
      isActivated: false
    });
    activatedUser = await MongoUser.create({
      username: 'activate-normal',
      password: hashStr(OLD_PASSWORD)
    });
  });

  it('updates the password and activates an unactivated account', async () => {
    await activateAccount({
      userId: String(unactivatedUser._id),
      newPassword: hashStr(NEW_PASSWORD)
    });

    expect(
      await MongoUser.exists({
        _id: unactivatedUser._id,
        password: hashStr(NEW_PASSWORD),
        isActivated: true
      })
    ).toBeTruthy();
  });

  it('records passwordUpdateTime', async () => {
    await activateAccount({
      userId: String(unactivatedUser._id),
      newPassword: hashStr(NEW_PASSWORD)
    });

    const updated = await MongoUser.findById(unactivatedUser._id).lean();
    expect(updated?.passwordUpdateTime).toBeInstanceOf(Date);
  });

  it('rejects when the account is already activated', async () => {
    // 这条无旧密码路径只适用于待激活账号，激活后必须拒绝重放。
    await expect(
      activateAccount({
        userId: String(activatedUser._id),
        newPassword: hashStr(NEW_PASSWORD)
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);

    expect(
      await MongoUser.exists({ _id: activatedUser._id, password: hashStr(OLD_PASSWORD) })
    ).toBeTruthy();
  });

  it('rejects a password identical to the current one', async () => {
    await expect(
      activateAccount({
        userId: String(unactivatedUser._id),
        newPassword: hashStr(OLD_PASSWORD)
      })
    ).rejects.toThrow(UserErrEnum.newPasswordSameAsOld);

    // 同密被拒后仍应保持待激活状态，用户需重新输入新密码。
    expect(
      await MongoUser.exists({ _id: unactivatedUser._id, isActivated: false })
    ).toBeTruthy();
  });

  it('rejects a non-existent user', async () => {
    await expect(
      activateAccount({
        userId: '68a1b2c3d4e5f60718293a4b',
        newPassword: hashStr(NEW_PASSWORD)
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);
  });

  it('cannot be replayed after the activation state is cleared', async () => {
    await activateAccount({
      userId: String(unactivatedUser._id),
      newPassword: hashStr(NEW_PASSWORD)
    });

    // 标记在首次成功后即被清除，二次调用落到 fail-closed 分支，不能再改一次。
    await expect(
      activateAccount({
        userId: String(unactivatedUser._id),
        newPassword: hashStr('another-new-password')
      })
    ).rejects.toThrow(UserErrEnum.passwordChangeAuthorizationInvalid);

    expect(
      await MongoUser.exists({ _id: unactivatedUser._id, password: hashStr(NEW_PASSWORD) })
    ).toBeTruthy();
  });
});
