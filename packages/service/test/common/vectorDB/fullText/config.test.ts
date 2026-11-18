import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VectorType } from '../../../../common/vectorDB/constants';
import {
  getFullTextProvider,
  shouldWriteMongoFullText
} from '../../../../common/vectorDB/fullText/config';

const config = vi.hoisted(() => ({ provider: 'pg' as VectorType, compatibility: false }));
vi.mock('@fastgpt/service/common/vectorDB/constants', () => ({
  getVectorType: () => config.provider
}));
vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    get TMP_MIGRATE_FULL_TEXT() {
      return config.compatibility;
    }
  }
}));
afterEach(() => {
  config.provider = 'pg';
  config.compatibility = false;
});

describe('SQL full-text mode', () => {
  it.each(['pg', 'seekdb', 'oceanbase', 'opengauss'] as const)(
    '%s pairs Mongo reads with dual writes only when compatibility is enabled',
    (provider) => {
      config.provider = provider;
      expect(getFullTextProvider()).toBe(provider);
      expect(shouldWriteMongoFullText()).toBe(false);
      config.compatibility = true;
      expect(getFullTextProvider()).toBe('mongo');
      expect(shouldWriteMongoFullText()).toBe(true);
    }
  );
  it.each([false, true])(
    'keeps native Milvus reads and writes with compatibility=%s',
    (compatibility) => {
      config.provider = 'milvus';
      config.compatibility = compatibility;
      expect(getFullTextProvider()).toBe('milvus');
      expect(shouldWriteMongoFullText()).toBe(false);
    }
  );
});
