import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  doc: undefined as any,
  findOne: vi.fn(),
  updateOne: vi.fn(),
  assertActive: vi.fn()
}));
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/schema', () => ({
  MongoSystemInstanceConfig: { collection: { findOne: mocks.findOne, updateOne: mocks.updateOne } }
}));

import {
  backfillExternalFileCheck,
  verifyExternalFileCheck
} from '@/migration/tasks/4180/20261110_backfill_external_file_check/service';

const run = () => backfillExternalFileCheck({ assertActive: mocks.assertActive });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.doc = {
    _id: 'security-doc',
    domain: 'security',
    revision: 3,
    overrides: {},
    explicitDefaultPaths: []
  };
  mocks.assertActive.mockResolvedValue(undefined);
  mocks.findOne.mockImplementation(async () => structuredClone(mocks.doc));
  mocks.updateOne.mockImplementation(async (filter, update) => {
    if (mocks.doc.revision !== filter.revision) return { modifiedCount: 0 };
    mocks.doc.overrides.checkExternalFile = update.$set['overrides.checkExternalFile'];
    mocks.doc.revision += 1;
    return { modifiedCount: 1 };
  });
});

describe('backfillExternalFileCheck', () => {
  it.each([{ list: [] }, { list: ['files.example.com'] }])(
    'preserves the old allowlist and its effective restriction: %j',
    async ({ list }) => {
      mocks.doc.overrides = { fileUrlWhitelist: list, csrfEnabled: false };
      expect(await run()).toEqual({ updatedDocuments: 1 });
      expect(mocks.doc.overrides).toEqual({
        fileUrlWhitelist: list,
        csrfEnabled: false,
        checkExternalFile: list.length > 0
      });
      expect(mocks.doc.revision).toBe(4);
      await verifyExternalFileCheck();
      expect(await run()).toEqual({ updatedDocuments: 0 });
      expect(mocks.updateOne).toHaveBeenCalledTimes(1);
    }
  );

  it('updates a supported legacy string-id domain through the native collection', async () => {
    mocks.doc = {
      _id: 'security',
      revision: 3,
      overrides: { fileUrlWhitelist: ['cdn.example.com'] }
    };
    await run();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: 'security', revision: 3 },
      expect.objectContaining({ $inc: { revision: 1 } })
    );
    expect(mocks.doc.overrides.checkExternalFile).toBe(true);
  });

  it('defaults to off without a historical list', async () => {
    await run();
    expect(mocks.doc.overrides).toEqual({ checkExternalFile: false });
  });

  it.each([false, true])('preserves an explicit switch value %s', async (enabled) => {
    mocks.doc.overrides = { fileUrlWhitelist: ['files.example.com'], checkExternalFile: enabled };
    expect(await run()).toEqual({ updatedDocuments: 0 });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('preserves a false value pruned into explicitDefaultPaths', async () => {
    mocks.doc.overrides = { fileUrlWhitelist: ['files.example.com'] };
    mocks.doc.explicitDefaultPaths = ['checkExternalFile'];
    expect(await run()).toEqual({ updatedDocuments: 0 });
    await expect(verifyExternalFileCheck()).resolves.toBeUndefined();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('rejects malformed explicit-default metadata instead of treating a string as a saved false', async () => {
    mocks.doc.overrides = { fileUrlWhitelist: ['files.example.com'] };
    mocks.doc.explicitDefaultPaths = 'checkExternalFile';
    await expect(run()).rejects.toThrow('Invalid security instance config explicitDefaultPaths');
    await expect(verifyExternalFileCheck()).rejects.toThrow(
      'Invalid security instance config explicitDefaultPaths'
    );
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('recomputes from the current list after a concurrent update', async () => {
    mocks.doc.overrides = { fileUrlWhitelist: ['files.example.com'] };
    mocks.updateOne.mockImplementationOnce(async () => {
      mocks.doc.revision += 1;
      mocks.doc.overrides.fileUrlWhitelist = [];
      return { modifiedCount: 0 };
    });
    await run();
    expect(mocks.doc.overrides.checkExternalFile).toBe(false);
    expect(mocks.updateOne.mock.calls.map(([filter]) => filter.revision)).toEqual([3, 4]);
  });

  it('stops before writing after lease loss and fails on repeated conflicts', async () => {
    mocks.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(run()).rejects.toThrow('lease lost');
    expect(mocks.updateOne).not.toHaveBeenCalled();
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(run()).rejects.toThrow('repeatedly conflicted');
    expect(mocks.updateOne).toHaveBeenCalledTimes(5);
  });

  it('rejects missing or invalid source data without writing', async () => {
    mocks.doc = undefined;
    await expect(run()).rejects.toThrow('Security instance config is missing');
    mocks.doc = { domain: 'security', revision: 3, overrides: { fileUrlWhitelist: [123] } };
    await expect(run()).rejects.toThrow();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});

describe('verifyExternalFileCheck', () => {
  it('rejects a missing document or switch instead of reporting success', async () => {
    await expect(verifyExternalFileCheck()).rejects.toThrow('incomplete');
    mocks.doc = undefined;
    await expect(verifyExternalFileCheck()).rejects.toThrow('missing');
  });
});
