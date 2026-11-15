import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFullTextProvider,
  shouldWriteMongoFullText
} from '@fastgpt/service/common/vectorDB/fullText/config';
import type { VectorType } from '@fastgpt/service/common/vectorDB/constants';

const config = vi.hoisted(() => ({
  vector: 'pg' as VectorType,
  DATASET_FULLTEXT_PROVIDER: undefined as 'mongo' | VectorType | undefined,
  DATASET_FULLTEXT_DUAL_WRITE: true
}));
vi.mock('@fastgpt/service/env', () => ({ serviceEnv: config }));
vi.mock('@fastgpt/service/common/vectorDB/constants', () => ({
  getVectorType: () => config.vector
}));

beforeEach(() => {
  config.vector = 'pg';
  config.DATASET_FULLTEXT_PROVIDER = undefined;
  config.DATASET_FULLTEXT_DUAL_WRITE = true;
});

describe('getFullTextProvider', () => {
  it.each(['pg', 'oceanbase', 'seekdb', 'opengauss'] as const)(
    'defaults %s to Mongo and permits explicit matching native reads',
    (provider) => {
      config.vector = provider;
      expect(getFullTextProvider()).toBe('mongo');
      config.DATASET_FULLTEXT_PROVIDER = provider;
      expect(getFullTextProvider()).toBe(provider);
      config.DATASET_FULLTEXT_PROVIDER = 'mongo';
      expect(getFullTextProvider()).toBe('mongo');
    }
  );

  it('preserves the existing Milvus path and rejects an unbackfilled Mongo route', () => {
    config.vector = 'milvus';
    expect(getFullTextProvider()).toBe('milvus');
    config.DATASET_FULLTEXT_PROVIDER = 'milvus';
    expect(getFullTextProvider()).toBe('milvus');
    config.DATASET_FULLTEXT_PROVIDER = 'mongo';
    expect(getFullTextProvider).toThrow('incompatible');
  });

  it('rejects native reads from a provider that does not own the vectors', () => {
    config.DATASET_FULLTEXT_PROVIDER = 'oceanbase';
    expect(getFullTextProvider).toThrow('incompatible');
  });
});

describe('shouldWriteMongoFullText', () => {
  it.each([true, false])('does not add Mongo maintenance to Milvus (dual=%s)', (dual) => {
    config.vector = 'milvus';
    config.DATASET_FULLTEXT_DUAL_WRITE = dual;
    expect(shouldWriteMongoFullText()).toBe(false);
  });

  it.each([true, false])(
    'always maintains Mongo when it is the primary read store (dual=%s)',
    (dual) => {
      config.DATASET_FULLTEXT_DUAL_WRITE = dual;
      expect(shouldWriteMongoFullText()).toBe(true);
    }
  );

  it.each([true, false])(
    'honors the compatibility write switch with native reads (dual=%s)',
    (dual) => {
      config.DATASET_FULLTEXT_PROVIDER = 'pg';
      config.DATASET_FULLTEXT_DUAL_WRITE = dual;
      expect(shouldWriteMongoFullText()).toBe(dual);
    }
  );
});
