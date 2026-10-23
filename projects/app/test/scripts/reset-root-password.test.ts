import { describe, expect, it } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  createRootPasswordUpdate,
  resolveRootPasswordArgument
} from '../../scripts/reset-root-password-utils';

describe('reset-root-password script', () => {
  it('defaults to 123456 and accepts exactly one optional password argument', () => {
    expect(resolveRootPasswordArgument([])).toBe('123456');
    expect(resolveRootPasswordArgument(['new-root-password'])).toBe('new-root-password');
    expect(() => resolveRootPasswordArgument(['first', 'second'])).toThrow('用法');
  });

  it('writes the root password hash using the schema storage format and marks the account inactive', () => {
    const password = '123456';
    const update = createRootPasswordUpdate(password);
    const modelHash = new MongoUser({ username: 'root', password: hashStr(password) }).toObject({
      getters: false
    }).password;

    expect(update.$set.password).toBe(modelHash);
    expect(update.$set.status).toBe(UserStatusEnum.inactive);
    expect(update.$set.passwordUpdateTime).toBeInstanceOf(Date);
  });
});
