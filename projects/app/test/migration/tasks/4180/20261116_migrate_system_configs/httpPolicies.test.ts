import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  rehomeHttpRuntimePolicies,
  verifyHttpRuntimePolicyMigration
} from '@/migration/tasks/4180/20261116_migrate_system_configs/backfill';

// 迁移的两域原子性必须使用远端副本集事务验证，不能沿用全局的无事务替身。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const collection = MongoSystemInstanceConfig.collection;
const assertActive = vi.fn().mockResolvedValue(undefined);
const run = (legacyEnv: Record<string, string | undefined> = {}) =>
  rehomeHttpRuntimePolicies({ assertActive, legacyEnv });
const read = (domain: 'security' | 'resource') => collection.findOne({ domain });

beforeEach(async () => {
  assertActive.mockReset().mockResolvedValue(undefined);
  await collection.insertMany([
    { domain: 'security', revision: 4, overrides: { csrfEnabled: true }, explicitDefaultPaths: [] },
    {
      domain: 'resource',
      revision: 7,
      overrides: { uploadFileMaxSize: 50 },
      explicitDefaultPaths: []
    }
  ]);
});

describe('rehomeHttpRuntimePolicies', () => {
  it('imports both ENV policies and preserves unrelated fields', async () => {
    expect(
      await run({ AUTH_COOKIE_SECURE: ' on ', SERVICE_AXIOS_MAX_CONTENT_LENGTH: '32' })
    ).toEqual({ updatedDocuments: 2 });
    expect(await read('security')).toMatchObject({
      revision: 5,
      overrides: { csrfEnabled: true, authCookieSecure: true }
    });
    expect(await read('resource')).toMatchObject({
      revision: 8,
      overrides: { uploadFileMaxSize: 50, serviceAxiosMaxContentLength: 32 }
    });
    await verifyHttpRuntimePolicyMigration();
  });

  it('persists defaults once and ignores obsolete ENV on replay', async () => {
    expect(await run()).toEqual({ updatedDocuments: 2 });
    expect(
      await run({ AUTH_COOKIE_SECURE: 'true', SERVICE_AXIOS_MAX_CONTENT_LENGTH: 'invalid-secret' })
    ).toEqual({ updatedDocuments: 0 });
    expect((await read('security'))?.overrides.authCookieSecure).toBe(false);
    expect((await read('resource'))?.overrides.serviceAxiosMaxContentLength).toBe(20);
    await verifyHttpRuntimePolicyMigration();
  });

  it('preserves the legacy zero-byte limit', async () => {
    await run({ SERVICE_AXIOS_MAX_CONTENT_LENGTH: '0' });
    expect((await read('resource'))?.overrides.serviceAxiosMaxContentLength).toBe(0);
  });

  it('respects existing overrides and explicit defaults without parsing obsolete ENV', async () => {
    await collection.updateOne(
      { domain: 'security' },
      { $set: { explicitDefaultPaths: ['authCookieSecure'] } }
    );
    await collection.updateOne(
      { domain: 'resource' },
      { $set: { 'overrides.serviceAxiosMaxContentLength': 50 } }
    );
    expect(await run({ SERVICE_AXIOS_MAX_CONTENT_LENGTH: 'invalid-secret' })).toEqual({
      updatedDocuments: 0
    });
    expect((await read('resource'))?.overrides.serviceAxiosMaxContentLength).toBe(50);
    await verifyHttpRuntimePolicyMigration();
  });

  it.each(['-1', '1.5', 'Infinity', 'invalid-secret'])(
    'keeps invalid input and commits both policy domains: %s',
    async (value) => {
      await run({ AUTH_COOKIE_SECURE: 'true', SERVICE_AXIOS_MAX_CONTENT_LENGTH: value });
      expect((await read('resource'))?.overrides.serviceAxiosMaxContentLength).toBe(value);
      expect((await read('security'))?.overrides.authCookieSecure).toBe(true);
      await verifyHttpRuntimePolicyMigration();
    }
  );

  it('rolls back the other domain on a revision conflict, then preserves the admin change', async () => {
    assertActive.mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'resource' },
        { $set: { 'overrides.serviceAxiosMaxContentLength': 60 }, $inc: { revision: 1 } }
      );
    });
    expect(
      await run({ AUTH_COOKIE_SECURE: 'true', SERVICE_AXIOS_MAX_CONTENT_LENGTH: '32' })
    ).toEqual({ updatedDocuments: 1 });
    // 第一次事务中的 security 更新必须回滚；重试只提交一次。
    expect(await read('security')).toMatchObject({
      revision: 5,
      overrides: { authCookieSecure: true }
    });
    expect(await read('resource')).toMatchObject({
      revision: 8,
      overrides: { serviceAxiosMaxContentLength: 60 }
    });
  });

  it('stops before writes when the lease is lost', async () => {
    assertActive.mockRejectedValue(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
    expect((await read('security'))?.revision).toBe(4);
    expect((await read('resource'))?.revision).toBe(7);
  });

  it('rejects a missing domain or corrupt metadata without partial writes', async () => {
    await collection.deleteOne({ domain: 'resource' });
    await expect(run()).rejects.toThrow('Missing HTTP policy configuration domain');
    expect((await read('security'))?.revision).toBe(4);
    await collection.insertOne({ domain: 'resource', revision: 1, explicitDefaultPaths: [123] });
    await expect(run()).rejects.toThrow('Invalid HTTP policy explicit-default metadata');
    expect((await read('security'))?.revision).toBe(4);
  });
});
