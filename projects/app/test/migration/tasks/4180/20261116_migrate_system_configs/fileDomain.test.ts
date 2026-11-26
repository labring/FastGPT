import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  rehomeFileDomain,
  verifyFileDomainMigration
} from '@/migration/tasks/4180/20261116_migrate_system_configs/backfill';

const collection = MongoSystemInstanceConfig.collection;
const assertActive = vi.fn();
const read = () => collection.findOne({ domain: 'storage' });
const run = (FILE_DOMAIN?: string) =>
  rehomeFileDomain({ assertActive, legacyEnv: { FILE_DOMAIN } });
beforeEach(async () => {
  assertActive.mockReset().mockResolvedValue(undefined);
  await collection.insertOne({
    domain: 'storage',
    revision: 3,
    overrides: { downloadMode: 'short-redirect' },
    explicitDefaultPaths: []
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('rehomeFileDomain', () => {
  it('imports the domain once and preserves later configuration on replay', async () => {
    expect(await run(' https://files.test/ ')).toEqual({ updatedDocuments: 1 });
    expect((await read())?.overrides).toEqual({
      downloadMode: 'short-redirect',
      fileDomain: 'https://files.test/'
    });
    expect(await run('https://different.test')).toEqual({ updatedDocuments: 0 });
    expect((await read())?.revision).toBe(4);
    await verifyFileDomainMigration();
  });

  it('preserves saved values and explicit clears without validating unused legacy ENV', async () => {
    await collection.updateOne(
      { domain: 'storage' },
      { $set: { 'overrides.fileDomain': 'https://admin.test' } }
    );
    expect(await run('invalid')).toEqual({ updatedDocuments: 0 });
    await collection.updateOne(
      { domain: 'storage' },
      { $unset: { 'overrides.fileDomain': '' }, $set: { explicitDefaultPaths: ['fileDomain'] } }
    );
    await run('https://legacy.test');
    expect((await read())?.overrides.fileDomain).toBe('');
    await verifyFileDomainMigration();
  });

  it('persists an absent source as empty and never revives legacy ENV on replay', async () => {
    await run();
    expect((await read())?.overrides.fileDomain).toBe('');
    expect(await run('https://legacy.test')).toEqual({ updatedDocuments: 0 });
  });

  it.each([
    'ftp://files.test',
    'https://',
    'https://user:private@files.test',
    'https://files.test?private=1',
    'https://files.test#private'
  ])('retains an invalid legacy file address for administrator repair: %s', async (domain) => {
    await run(domain);
    expect((await read())?.overrides.fileDomain).toBe(domain);
    await verifyFileDomainMigration();
  });

  it('rejects malformed stored configuration and explicit-default metadata', async () => {
    await collection.updateOne({ domain: 'storage' }, { $set: { 'overrides.fileDomain': null } });
    await run('https://files.test');
    expect((await read())?.overrides.fileDomain).toBeNull();
    await collection.updateOne(
      { domain: 'storage' },
      { $set: { explicitDefaultPaths: 'fileDomain' } }
    );
    await expect(run()).rejects.toThrow('Invalid storage explicit-default metadata');
  });

  it('retries a concurrent administrator save and preserves the new value', async () => {
    assertActive.mockImplementationOnce(async () => {
      await collection.updateOne(
        { domain: 'storage' },
        { $set: { 'overrides.fileDomain': 'https://admin.test' }, $inc: { revision: 1 } }
      );
    });
    expect(await run('https://legacy.test')).toEqual({ updatedDocuments: 0 });
    expect((await read())?.overrides.fileDomain).toBe('https://admin.test');
  });

  it('stops after bounded CAS conflicts or a lost lease', async () => {
    assertActive.mockImplementation(async () => {
      await collection.updateOne({ domain: 'storage' }, { $inc: { revision: 1 } });
    });
    await expect(run()).rejects.toThrow('repeatedly conflicted');
    expect(assertActive).toHaveBeenCalledTimes(5);
    expect((await read())?.overrides).not.toHaveProperty('fileDomain');
    assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
  });
});

describe('verifyFileDomainMigration', () => {
  it('rejects absent, incomplete and invalid persistent targets', async () => {
    await expect(verifyFileDomainMigration()).rejects.toThrow('migration is incomplete');
    await collection.updateOne({ domain: 'storage' }, { $set: { 'overrides.fileDomain': 123 } });
    await expect(verifyFileDomainMigration()).resolves.toBeUndefined();
    await collection.deleteMany({});
    await expect(run()).rejects.toThrow('Storage instance config is missing');
    await expect(verifyFileDomainMigration()).rejects.toThrow('Storage instance config is missing');
  });
});
