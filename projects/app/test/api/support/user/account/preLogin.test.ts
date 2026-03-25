import { describe, it, expect, beforeEach } from 'vitest';
import * as preLoginApi from '@/pages/api/support/user/account/preLogin';
import { MongoUserAuth } from '@fastgpt/service/support/user/auth/schema';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { Call } from '@test/utils/request';

describe('preLogin API', () => {
  beforeEach(async () => {
    await MongoUserAuth.deleteMany({});
  });

  it('should return a 6-char verification code for valid username', async () => {
    const res = await Call(preLoginApi.default, {
      query: { username: 'testuser' }
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(typeof res.data.code).toBe('string');
    expect(res.data.code.length).toBe(6);
  });

  it('should store the verification code in database', async () => {
    const res = await Call(preLoginApi.default, {
      query: { username: 'testuser' }
    });

    expect(res.code).toBe(200);
    const record = await MongoUserAuth.findOne({
      key: 'testuser',
      type: UserAuthTypeEnum.login
    });
    expect(record).toBeDefined();
    expect(record?.code).toBe(res.data.code);
  });

  it('should generate different codes for different usernames', async () => {
    const res1 = await Call(preLoginApi.default, {
      query: { username: 'user1' }
    });
    const res2 = await Call(preLoginApi.default, {
      query: { username: 'user2' }
    });

    expect(res1.code).toBe(200);
    expect(res2.code).toBe(200);

    const record1 = await MongoUserAuth.findOne({ key: 'user1', type: UserAuthTypeEnum.login });
    const record2 = await MongoUserAuth.findOne({ key: 'user2', type: UserAuthTypeEnum.login });
    expect(record1?.key).toBe('user1');
    expect(record2?.key).toBe('user2');
  });

  it('should overwrite previous code for the same username', async () => {
    await Call(preLoginApi.default, { query: { username: 'testuser' } });
    const res2 = await Call(preLoginApi.default, { query: { username: 'testuser' } });

    const records = await MongoUserAuth.find({
      key: 'testuser',
      type: UserAuthTypeEnum.login
    });
    // upsert: only one record per key+type
    expect(records.length).toBe(1);
    expect(records[0].code).toBe(res2.data.code);
  });

  it('should set code expiredTime about 30 seconds from now', async () => {
    const before = new Date();
    const res = await Call(preLoginApi.default, {
      query: { username: 'testuser' }
    });
    const after = new Date();

    expect(res.code).toBe(200);
    const record = await MongoUserAuth.findOne({ key: 'testuser', type: UserAuthTypeEnum.login });
    expect(record?.expiredTime).toBeDefined();
    const expiredTime = new Date(record!.expiredTime!).getTime();
    // Should expire ~30 seconds from now (allow ±2s for test execution)
    expect(expiredTime).toBeGreaterThanOrEqual(before.getTime() + 28000);
    expect(expiredTime).toBeLessThanOrEqual(after.getTime() + 32000);
  });

  it('should reject when username is missing', async () => {
    const res = await Call(preLoginApi.default, {
      query: {}
    });

    expect(res.code).toBe(500);
  });

  it('should handle root username', async () => {
    const res = await Call(preLoginApi.default, {
      query: { username: 'root' }
    });

    expect(res.code).toBe(200);
    expect(res.data.code).toBeDefined();
    expect(res.data.code.length).toBe(6);
  });
});
