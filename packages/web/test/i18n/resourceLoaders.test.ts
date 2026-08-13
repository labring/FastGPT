import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleList } from '@fastgpt/global/common/i18n/type';
import { I18N_NAMESPACES } from '@fastgpt/web/i18n/constants';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import {
  clearLocaleResourceFailure,
  getLocaleResourceError,
  getLocaleResourceStatus,
  loadLocaleResource
} from '@fastgpt/web/i18n/resourceLoaders';

describe('generatedLoaders', () => {
  it('contains every supported language and namespace', () => {
    expect(Object.keys(generatedLoaders)).toEqual(LocaleList);
    for (const language of LocaleList) {
      expect(Object.keys(generatedLoaders[language])).toEqual(I18N_NAMESPACES);
    }
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
