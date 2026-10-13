import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadLocaleResourceWithRetry } = vi.hoisted(() => ({
  loadLocaleResourceWithRetry: vi.fn()
}));

vi.mock('@fastgpt/web/i18n/resourceLoaders', () => ({
  loadLocaleResourceWithRetry
}));

import dynamicImportBackend from '@fastgpt/web/i18n/dynamicImportBackend';
import type { ClientI18nLoadError } from '@fastgpt/web/i18n/ClientI18nLoadError';
import type { localeType } from '@fastgpt/global/common/i18n/type';

const readResource = (language: localeType, namespace: 'common') =>
  new Promise((resolve, reject) => {
    dynamicImportBackend.read(language, namespace, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });

describe('dynamicImportBackend.read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a loaded language resource', async () => {
    const resource = { Confirm: '확인' };
    loadLocaleResourceWithRetry.mockResolvedValue(resource);

    await expect(readResource('ko-KR', 'common')).resolves.toBe(resource);
    expect(loadLocaleResourceWithRetry).toHaveBeenCalledOnce();
  });

  it('reuses the in-flight request for the same language and namespace', async () => {
    let resolveLoad: ((resource: Record<string, string>) => void) | undefined;
    loadLocaleResourceWithRetry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        })
    );

    const firstRead = readResource('zh-CN', 'common');
    const secondRead = readResource('zh-CN', 'common');
    resolveLoad?.({ Confirm: '确认' });

    await expect(Promise.all([firstRead, secondRead])).resolves.toEqual([
      { Confirm: '确认' },
      { Confirm: '确认' }
    ]);
    expect(loadLocaleResourceWithRetry).toHaveBeenCalledOnce();
  });

  it('returns a typed load error after all retries fail', async () => {
    const cause = new Error('chunk unavailable');
    loadLocaleResourceWithRetry.mockRejectedValue(cause);

    await expect(readResource('en', 'common')).rejects.toMatchObject({
      name: 'ClientI18nLoadError',
      language: 'en',
      namespace: 'common',
      cause
    } satisfies Partial<ClientI18nLoadError>);
    expect(loadLocaleResourceWithRetry).toHaveBeenCalledOnce();
  });
});
