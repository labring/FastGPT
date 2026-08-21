import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFastGPTSem,
  initFastGPTSemSourceDomain,
  onFastGPTLoginSuccess,
  removeFastGPTSem,
  setFastGPTSem
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

  it('should persist visitor_id without source attribution fields', () => {
    setFastGPTSem({
      visitor_id: ' visitor-1 '
    });

    expect(getFastGPTSem()).toEqual({
      visitor_id: 'visitor-1'
    });
  });

  it('should not persist an oversized visitor_id', () => {
    setFastGPTSem({
      visitor_id: 'a'.repeat(65)
    });

    expect(localStorage.getItem('fastgpt_sem')).toBeNull();
    expect(getFastGPTSem()).toBeUndefined();
  });

  it('should discard unknown marketing fields', () => {
    localStorage.setItem(
      'fastgpt_sem',
      JSON.stringify({
        visitor_id: 'visitor-current',
        unknown_field: 'discarded'
      })
    );

    expect(getFastGPTSem()).toEqual({
      visitor_id: 'visitor-current'
    });
  });

  it('should clear pending marketing data after login succeeds', async () => {
    setFastGPTSem({
      visitor_id: 'visitor-1'
    });
    const loginSuccess = vi.fn();

    await onFastGPTLoginSuccess(loginSuccess, { ok: true });

    expect(loginSuccess).toHaveBeenCalledWith({ ok: true });
    expect(getFastGPTSem()).toBeUndefined();
  });
});
