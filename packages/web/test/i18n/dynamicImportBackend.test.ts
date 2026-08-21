import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadLocaleResource, clearLocaleResourceFailure } = vi.hoisted(() => ({
  loadLocaleResource: vi.fn(),
  clearLocaleResourceFailure: vi.fn()
}));

vi.mock('@fastgpt/web/i18n/resourceLoaders', () => ({
  loadLocaleResource,
  clearLocaleResourceFailure
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
    loadLocaleResource.mockResolvedValue(resource);

    await expect(readResource('ko-KR', 'common')).resolves.toBe(resource);
    expect(loadLocaleResource).toHaveBeenCalledOnce();
    expect(clearLocaleResourceFailure).not.toHaveBeenCalled();
  });

  it('reuses the in-flight request for the same language and namespace', async () => {
    let resolveLoad: ((resource: Record<string, string>) => void) | undefined;
    loadLocaleResource.mockImplementation(
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
    expect(loadLocaleResource).toHaveBeenCalledOnce();
  });

  it('retries three times after the initial load and then succeeds', async () => {
    loadLocaleResource
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockRejectedValueOnce(new Error('third failure'))
      .mockResolvedValue({ Confirm: '確認' });

    await expect(readResource('zh-Hant', 'common')).resolves.toEqual({ Confirm: '確認' });
    expect(loadLocaleResource).toHaveBeenCalledTimes(4);
    expect(clearLocaleResourceFailure).toHaveBeenCalledTimes(3);
  });

  it('returns a typed load error after all retries fail', async () => {
    const cause = new Error('chunk unavailable');
    loadLocaleResource.mockRejectedValue(cause);

    await expect(readResource('en', 'common')).rejects.toMatchObject({
      name: 'ClientI18nLoadError',
      language: 'en',
      namespace: 'common',
      cause
    } satisfies Partial<ClientI18nLoadError>);
    expect(loadLocaleResource).toHaveBeenCalledTimes(4);
    expect(clearLocaleResourceFailure).toHaveBeenCalledTimes(3);
  });
});
