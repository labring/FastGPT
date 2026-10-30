import { describe, expect, it } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  createRootPasswordUpdate,
  resolveRootPasswordArgument
} from '../../scripts/reset-root-password-utils';

describe('reset-root-password script', () => {
  it('requires exactly one password argument and rejects empty or multiple arguments', () => {
    expect(resolveRootPasswordArgument(['new-root-password'])).toBe('new-root-password');
    expect(() => resolveRootPasswordArgument([])).toThrow('用法');
    expect(() => resolveRootPasswordArgument(['first', 'second'])).toThrow('用法');
  });

  it('writes the root password hash using the schema storage format without changing status', () => {
    const password = 'new-root-password';
    const update = createRootPasswordUpdate(password);
    const modelHash = new MongoUser({ username: 'root', password: hashStr(password) }).toObject({
      getters: false
    }).password;

    expect(update.$set.password).toBe(modelHash);
    expect(update.$set.passwordUpdateTime).toBeInstanceOf(Date);
    expect(update.$set).not.toHaveProperty('status');
  });
});
