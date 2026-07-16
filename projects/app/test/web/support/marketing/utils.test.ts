import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFastGPTSem,
  initFastGPTSemSourceDomain,
  onFastGPTLoginSuccess,
  parseFastGPTSource,
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

  it('should parse the source attribution object from the URL', () => {
    expect(
      parseFastGPTSource(
        JSON.stringify({
          visitor_id: 'visitor-1',
          first_touch_source: 'ChatGPT',
          is_paid: false
        })
      )
    ).toMatchObject({
      visitor_id: 'visitor-1',
      first_touch_source: 'ChatGPT',
      is_paid: false
    });
  });

  it('should ignore an invalid source attribution object', () => {
    expect(parseFastGPTSource('{invalid')).toBeUndefined();
  });

  it('should keep home source independent from first and last source', () => {
    setFastGPTSem({
      source: 'home_hero_trial',
      home_source: {
        visitor_id: 'visitor-1',
        first_touch_source: 'ChatGPT'
      }
    });

    expect(getFastGPTSem()).toEqual({
      source: 'home_hero_trial',
      home_source: {
        visitor_id: 'visitor-1',
        first_touch_source: 'ChatGPT'
      }
    });
  });

  it('should not send persisted first and last source fields from the client', () => {
    localStorage.setItem(
      'fastgpt_sem',
      JSON.stringify({
        home_source: { visitor_id: 'visitor-current' },
        firstsource: { visitor_id: 'visitor-first' },
        lastsource: { visitor_id: 'visitor-last' }
      })
    );

    expect(getFastGPTSem()).toEqual({
      home_source: { visitor_id: 'visitor-current' }
    });
  });

  it('should clear pending marketing data after login succeeds', async () => {
    setFastGPTSem({
      home_source: { visitor_id: 'visitor-1' }
    });
    const loginSuccess = vi.fn();

    await onFastGPTLoginSuccess(loginSuccess, { ok: true });

    expect(loginSuccess).toHaveBeenCalledWith({ ok: true });
    expect(getFastGPTSem()).toBeUndefined();
  });
});
