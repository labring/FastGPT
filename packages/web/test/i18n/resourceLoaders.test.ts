import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleList } from '@fastgpt/global/common/i18n/type';
import { I18N_NAMESPACES } from '@fastgpt/web/i18n/constants';
import {
  generatedLoaders,
  generatedLanguageBundles
} from '@fastgpt/web/i18n/resourceLoaders.generated';
import {
  clearLanguageBundleFailure,
  clearLocaleResourceFailure,
  getLocaleResourceError,
  getLocaleResourceStatus,
  loadLanguageBundle,
  loadLanguageBundleWithRetry,
  loadLocaleResource,
  loadLocaleResourceWithRetry
} from '@fastgpt/web/i18n/resourceLoaders';

describe('generatedLoaders', () => {
  const s3UploadErrorKeys = [
    'error.s3_upload_auth_failed',
    'error.s3_upload_bucket_not_found',
    'error.s3_upload_file_too_large',
    'error.s3_upload_invalid_file_type',
    'error.s3_upload_network_error',
    'error.s3_upload_timeout'
  ];

  it('contains every supported language and namespace', () => {
    expect(Object.keys(generatedLoaders)).toEqual(LocaleList);
    for (const language of LocaleList) {
      expect(Object.keys(generatedLoaders[language])).toEqual(I18N_NAMESPACES);
    }
  });

  it('contains all S3 upload error translations in every language', async () => {
    for (const language of LocaleList) {
      const resource = (await generatedLoaders[language].common()).default;
      expect(Object.keys(resource)).toEqual(expect.arrayContaining(s3UploadErrorKeys));
    }
  });
});

describe('generatedLanguageBundles', () => {
  it('contains every supported language bundle loader', () => {
    expect(Object.keys(generatedLanguageBundles)).toEqual(LocaleList);
  });

  it('loads valid bundles with all namespaces in each language', async () => {
    for (const language of LocaleList) {
      const bundle = (await generatedLanguageBundles[language]()).default;
      expect(Object.keys(bundle)).toEqual(I18N_NAMESPACES);
      expect(bundle.common).toHaveProperty('Confirm');
    }
  });
});

describe('loadLanguageBundle', () => {
  const originalEnglishBundleLoader = generatedLanguageBundles.en;

  beforeEach(() => {
    generatedLanguageBundles.en = originalEnglishBundleLoader;
    clearLanguageBundleFailure('en');
  });

  it('复用同一语言正在进行的加载，并同步所有 namespace 状态', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fakeBundle = Object.fromEntries(
      I18N_NAMESPACES.map((namespace) => [namespace, { namespace }])
    );
    const bundleLoader = vi.fn(async () => {
      await pending;
      return { default: fakeBundle };
    });
    generatedLanguageBundles.en = bundleLoader as any;

    const first = loadLanguageBundle('en');
    const second = loadLanguageBundle('en');
    release?.();

    const [firstBundle, secondBundle] = await Promise.all([first, second]);
    expect(firstBundle).toBe(secondBundle);
    expect(Object.keys(firstBundle)).toEqual(I18N_NAMESPACES);
    expect(bundleLoader).toHaveBeenCalledTimes(1);
    expect(
      I18N_NAMESPACES.every((namespace) => getLocaleResourceStatus('en', namespace) === 'loaded')
    ).toBe(true);
  });
});

describe('loadLocaleResource', () => {
  const originalCommonLoader = generatedLoaders.en.common;

  beforeEach(() => {
    generatedLoaders.en.common = originalCommonLoader;
    clearLocaleResourceFailure('en', 'common');
  });

  it('loads a generated resource and records its state', async () => {
    await expect(loadLocaleResource('en', 'common')).resolves.toHaveProperty('Confirm');
    expect(getLocaleResourceStatus('en', 'common')).toBe('loaded');
    expect(getLocaleResourceError('en', 'common')).toBeUndefined();
  });

  it('rejects an unsupported loader without recording a resource state', async () => {
    await expect(loadLocaleResource('en', 'missing' as 'common')).rejects.toThrow(
      'Missing i18n resource loader: en/missing'
    );
    expect(getLocaleResourceStatus('en', 'missing' as 'common')).toBeUndefined();
  });

  it('records the loader error and clears it for a retry', async () => {
    const error = new Error('chunk unavailable');
    generatedLoaders.en.common = async () => {
      throw error;
    };

    await expect(loadLocaleResource('en', 'common')).rejects.toBe(error);
    expect(getLocaleResourceStatus('en', 'common')).toBe('failed');
    expect(getLocaleResourceError('en', 'common')).toBe(error);

    clearLocaleResourceFailure('en', 'common');
    expect(getLocaleResourceStatus('en', 'common')).toBeUndefined();
    expect(getLocaleResourceError('en', 'common')).toBeUndefined();
  });
});

describe('loadLocaleResourceWithRetry', () => {
  const originalCommonLoader = generatedLoaders.en.common;

  beforeEach(() => {
    vi.useFakeTimers();
    generatedLoaders.en.common = originalCommonLoader;
    clearLocaleResourceFailure('en', 'common');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries with backoff and returns the recovered resource', async () => {
    const resource = { Confirm: 'Confirm' };
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue({ default: resource });
    generatedLoaders.en.common = loader;

    const loading = loadLocaleResourceWithRetry('en', 'common');
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(loading).resolves.toBe(resource);
    expect(loader).toHaveBeenCalledTimes(3);
    expect(getLocaleResourceStatus('en', 'common')).toBe('loaded');
    expect(getLocaleResourceError('en', 'common')).toBeUndefined();
  });

  it('keeps the final error after all retry attempts fail', async () => {
    const error = new Error('chunk unavailable');
    const loader = vi.fn().mockRejectedValue(error);
    generatedLoaders.en.common = loader;

    const loading = loadLocaleResourceWithRetry('en', 'common');
    const assertion = expect(loading).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(4300);

    await assertion;
    expect(loader).toHaveBeenCalledTimes(4);
    expect(getLocaleResourceStatus('en', 'common')).toBe('failed');
    expect(getLocaleResourceError('en', 'common')).toBe(error);
  });
});

describe('loadLanguageBundleWithRetry', () => {
  const originalEnglishBundleLoader = generatedLanguageBundles.en;

  beforeEach(() => {
    vi.useFakeTimers();
    generatedLanguageBundles.en = originalEnglishBundleLoader;
    clearLanguageBundleFailure('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('完整语言 chunk 加载失败后按退避策略重试', async () => {
    const bundleLoader = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue({
        default: Object.fromEntries(
          I18N_NAMESPACES.map((ns) => [ns, ns === 'common' ? { Confirm: 'Confirm' } : {}])
        )
      });
    generatedLanguageBundles.en = bundleLoader as any;

    const loading = loadLanguageBundleWithRetry('en');
    await vi.advanceTimersByTimeAsync(300);

    await expect(loading).resolves.toHaveProperty('common.Confirm', 'Confirm');
    expect(bundleLoader).toHaveBeenCalledTimes(2);
  });
});
