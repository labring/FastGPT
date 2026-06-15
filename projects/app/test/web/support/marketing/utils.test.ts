import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFastGPTSem,
  initFastGPTSemSourceDomain,
  removeFastGPTSem
} from '@/web/support/marketing/utils';

const storageMock = () => {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear())
  };
};

describe('marketing utils', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', storageMock());
    vi.stubGlobal('document', { referrer: '' });
  });

  it('should lock sourceDomain after the first init even when source is empty', () => {
    initFastGPTSemSourceDomain();
    vi.stubGlobal('document', { referrer: 'https://redirect.example.com' });

    initFastGPTSemSourceDomain();

    expect(getFastGPTSem()?.sourceDomain).toBeUndefined();
  });

  it('should remove sourceDomain init lock with fastgpt sem', () => {
    initFastGPTSemSourceDomain();
    removeFastGPTSem();
    initFastGPTSemSourceDomain('https://example.com');

    expect(getFastGPTSem()?.sourceDomain).toBe('https://example.com');
  });
});
