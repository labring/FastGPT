import { hashStr } from '@fastgpt/global/common/string/tools';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { Mongoose } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { getUserModel, UserDocumentSchema } from '../../../mongodb/models/user';

describe('UserDocumentSchema', () => {
  it('matches production defaults and hashes password writes', () => {
    const UserModel = getUserModel(new Mongoose());
    const document = new UserModel({ username: 'user@example.com', password: 'password' });

    expect(document.status).toBe(UserStatusEnum.active);
    expect(document.createTime).toBeInstanceOf(Date);
    expect(document.promotionRate).toBe(0);
    expect(document.timezone).toBe('Asia/Shanghai');
    expect(document.language).toBe(LangEnum.zh_CN);
    expect(document.tags).toEqual([]);
    expect(document.get('password', null, { getters: false })).toBe(hashStr('password'));
    expect(document.password).toBe(hashStr(hashStr('password')));
    expect(UserDocumentSchema.path('password').options.select).toBe(false);
  });

  it('declares the production username and createTime indexes', () => {
    expect(UserDocumentSchema.indexes()).toEqual([
      [{ username: 1 }, { unique: true, background: true }],
      [{ createTime: -1 }, { background: true }]
    ]);
  });

  it('reuses the model within the same Mongoose client', () => {
    const client = new Mongoose();
    expect(getUserModel(client)).toBe(getUserModel(client));
  });
});
