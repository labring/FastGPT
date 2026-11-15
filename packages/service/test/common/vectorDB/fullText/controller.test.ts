import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSqlFullTextAdapter,
  startSqlFullTextIndexBuild
} from '@fastgpt/service/common/vectorDB/fullText/controller';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  warn: vi.fn(),
  metadata: { targetId: 'target', analyzerVersion: 'test' }
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', () => ({ getVectorType: () => 'pg' }));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ warn: mocks.warn }),
  LogCategories: { INFRA: { VECTOR: 'vector' } }
}));
vi.mock('@fastgpt/service/common/vectorDB/pg/fullText', () => ({
  preparePgFullText: mocks.prepare,
  assertPgFullTextCapability: vi.fn(),
  getPgFullTextMetadata: vi.fn(),
  fillPgFullText: vi.fn(),
  searchPgFullText: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/opengauss/fullText', () => ({
  prepareOpenGaussFullText: mocks.prepare,
  assertOpenGaussFullTextCapability: vi.fn(),
  getOpenGaussFullTextMetadata: vi.fn(),
  fillOpenGaussFullText: vi.fn(),
  searchOpenGaussFullText: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/oceanbase/fullText', () => ({
  OceanBaseFullTextAdapter: class {
    prepare = mocks.prepare;
    constructor(readonly provider: string) {}
  }
}));

beforeEach(() => {
  mocks.prepare.mockReset().mockResolvedValue(mocks.metadata);
  mocks.warn.mockReset();
});

describe('getSqlFullTextAdapter', () => {
  it.each(['pg', 'opengauss', 'oceanbase', 'seekdb'] as const)(
    'shares an in-flight %s preparation between startup and migration, then permits revalidation',
    async (provider) => {
      const adapter = getSqlFullTextAdapter(provider);
      expect(getSqlFullTextAdapter(provider)).toBe(adapter);
      let resolve!: (value: typeof mocks.metadata) => void;
      mocks.prepare.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        })
      );
      const first = adapter.prepare();
      expect(adapter.prepare()).toBe(first);
      expect(mocks.prepare).toHaveBeenCalledOnce();
      resolve(mocks.metadata);
      await expect(first).resolves.toEqual(mocks.metadata);
      await adapter.prepare();
      expect(mocks.prepare).toHaveBeenCalledTimes(2);
    }
  );

  it('uses the configured provider by default and rejects Milvus', () => {
    expect(getSqlFullTextAdapter()).toBe(getSqlFullTextAdapter('pg'));
    expect(() => getSqlFullTextAdapter('milvus')).toThrow('existing native');
  });
});

describe('startSqlFullTextIndexBuild', () => {
  it('returns immediately while index construction is pending', async () => {
    let resolve!: (value: typeof mocks.metadata) => void;
    mocks.prepare.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    expect(startSqlFullTextIndexBuild('pg')).toBeUndefined();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.warn).not.toHaveBeenCalled();
    const pending = getSqlFullTextAdapter('pg').prepare();
    resolve(mocks.metadata);
    await pending;
  });

  it('handles background rejection and allows a subsequent migration retry', async () => {
    const error = new Error('extension unavailable');
    mocks.prepare.mockRejectedValueOnce(error);
    startSqlFullTextIndexBuild('pg');
    await expect(getSqlFullTextAdapter('pg').prepare()).rejects.toBe(error);
    expect(mocks.warn).toHaveBeenCalledWith('SQL full-text background index build failed', {
      provider: 'pg',
      error
    });
    await expect(getSqlFullTextAdapter('pg').prepare()).resolves.toEqual(mocks.metadata);
  });
});
