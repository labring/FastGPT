import { describe, it, expect, beforeEach } from 'vitest';
import * as preLoginApi from '@/pages/api/support/user/account/preLogin';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { getDataId } from '@fastgpt/service/support/tmpData/verification';
import { Call } from '@test/utils/request';

describe('preLogin API', () => {
  beforeEach(async () => {
    await MongoTmpData.deleteMany({});
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
    const record = await MongoTmpData.findOne({
      dataId: getDataId('login', 'password', 'testuser')
    });
    expect(record).toBeDefined();
    expect(record?.data).toEqual({ preLoginCode: res.data.code });
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

    const record1 = await MongoTmpData.findOne({
      dataId: getDataId('login', 'password', 'user1')
    });
    const record2 = await MongoTmpData.findOne({
      dataId: getDataId('login', 'password', 'user2')
    });
    expect(record1?.data).toEqual({ preLoginCode: res1.data.code });
    expect(record2?.data).toEqual({ preLoginCode: res2.data.code });
  });

  it('should overwrite previous code for the same username', async () => {
    await Call(preLoginApi.default, { query: { username: 'testuser' } });
    const res2 = await Call(preLoginApi.default, { query: { username: 'testuser' } });

    const records = await MongoTmpData.find({
      dataId: getDataId('login', 'password', 'testuser')
    });
    // upsert: only one record per key+type
    expect(records.length).toBe(1);
    expect(records[0].data).toEqual({ preLoginCode: res2.data.code });
  });

  it('should set code expiredTime about 30 seconds from now', async () => {
    const before = new Date();
    const res = await Call(preLoginApi.default, {
      query: { username: 'testuser' }
    });
    const after = new Date();

    expect(res.code).toBe(200);
    const record = await MongoTmpData.findOne({
      dataId: getDataId('login', 'password', 'testuser')
    });
    expect(record?.expireAt).toBeDefined();
    const expiredTime = new Date(record!.expireAt).getTime();
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
