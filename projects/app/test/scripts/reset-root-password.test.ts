import { describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  checkPasswordRule as scriptCheckPasswordRule,
  computeStoredPasswordHash,
  parseArgs,
  resetUserPassword
} from '../../scripts/reset-root-password.mjs';

/** 造一个只实现 findOne / updateOne 的假集合，避免单测依赖真实 Mongo。 */
const createFakeCollection = ({ found = true } = {}) => {
  const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const findOne = vi.fn().mockResolvedValue(found ? { _id: 'user-id' } : null);
  return { users: { findOne, updateOne }, findOne, updateOne };
};

describe('reset-root-password script', () => {
  it('produces the same stored hash as the user schema setter', () => {
    // schema 未导出 setter 函数，只能从已注册的字段上取；运行时 SchemaType 一定带 applySetters。
    const passwordPath = MongoUser.schema.path('password') as unknown as {
      applySetters: (value: string) => string;
    };

    for (const plaintext of ['Xxx@12345', '123456', '1234', 'aB3!aB3!']) {
      // 业务层提交的是 hashStr(明文)，schema 的 set 钩子会再哈希一次。
      expect(computeStoredPasswordHash(plaintext)).toBe(
        passwordPath.applySetters(hashStr(plaintext))
      );
    }

    expect(computeStoredPasswordHash('Xxx@12345')).toBe(hashStr(hashStr('Xxx@12345')));
  });

  it('keeps the strength rule in sync with the shared implementation', () => {
    const samples = [
      '123456',
      '1234',
      'Xxx@12345',
      'Abcd1234',
      'abcd1234',
      'ABCD1234',
      'aB3!aB3!',
      '123',
      'a'.repeat(101),
      'abcdefgh',
      '12345678',
      'Passw0rd',
      'password with space1',
      '中文密码1234'
    ];

    for (const sample of samples) {
      expect(scriptCheckPasswordRule(sample)).toBe(checkPasswordRule(sample));
    }
  });

  it('defaults to the root account and rejects unknown arguments', () => {
    // 默认不 dry-run / 不 force：误触脚本必须真的写库，但要先经强度校验。
    expect(parseArgs([])).toEqual({
      user: 'root',
      stdin: false,
      dryRun: false,
      force: false,
      help: false
    });
    expect(parseArgs(['--', '--stdin', '--dry-run'])).toMatchObject({
      stdin: true,
      dryRun: true
    });
    expect(parseArgs(['--user', 'admin']).user).toBe('admin');
    expect(parseArgs(['--help']).help).toBe(true);
    expect(() => parseArgs(['--nope'])).toThrow('未知参数');
  });

  it('does not write when running with --dry-run', async () => {
    const { users, updateOne } = createFakeCollection();

    await expect(
      resetUserPassword({ users, username: 'root', password: '123456', dryRun: true })
    ).resolves.toEqual({ dryRun: true, username: 'root', mustChangePassword: false });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('writes only the three password fields', async () => {
    const { users, updateOne } = createFakeCollection();

    await resetUserPassword({ users, username: 'root', password: 'Xxx@12345' });

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'user-id' });
    expect(Object.keys(update.$set).sort()).toEqual([
      'mustChangePassword',
      'password',
      'passwordUpdateTime'
    ]);
    expect(update.$set.password).toBe(computeStoredPasswordHash('Xxx@12345'));
    expect(update.$set.passwordUpdateTime).toBeInstanceOf(Date);
  });

  it('never sets the forced-change flag, and clears any existing one', async () => {
    // 强度校验在 main 里拦截输入（弱口令必须显式 --force），脚本本身不再产生「必须改密」状态：
    // 运维主动重置等于确认了口令。这里同时断言弱口令与强口令都写 false——重置是终态，需要清掉历史标记。
    for (const password of ['123456', 'abcdefgh', '12345678', 'Xxx@12345', 'Abcd1234']) {
      const { users, updateOne } = createFakeCollection();

      await resetUserPassword({ users, username: 'root', password });

      expect(updateOne.mock.calls[0][1].$set.mustChangePassword).toBe(false);
    }
  });

  it('fails without creating the account when the target user does not exist', async () => {
    const { users, updateOne } = createFakeCollection({ found: false });

    await expect(
      resetUserPassword({ users, username: 'no-such-user', password: 'Xxx@12345' })
    ).rejects.toThrow('用户不存在：no-such-user');
    expect(updateOne).not.toHaveBeenCalled();
  });
});
