import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleList } from '@fastgpt/global/common/i18n/type';
import { createServerTranslator } from '@fastgpt/web/i18n/server';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';

describe('createServerTranslator', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(LocaleList)('translates requested namespaces in %s', async (locale) => {
    const { t } = await createServerTranslator({ locale, namespaces: ['account_team'] });
    expect(t('account_team:log_time')).not.toContain('account_team:');
    expect(t('account_team:audit_export_filename')).not.toContain('account_team:');
  });

  it('includes common by default and supports flat keys containing dots', async () => {
    const { t } = await createServerTranslator({ locale: 'zh-CN', namespaces: [] });
    expect(t('Confirm')).toBe('确认');
    expect(t('common:error.missingParams')).toBe('参数缺失');
  });

  it('interpolates user values without HTML escaping or translating their content', async () => {
    const { t } = await createServerTranslator({ locale: 'zh-CN', namespaces: ['account_team'] });
    const name = '<用户> & https://example.com/路径\ncommon:Confirm';
    expect(t('account_team:log_login', { name })).toBe(`【${name}】登录了系统`);
  });

  it('falls back to English for missing translations, then the original key or explicit default', async () => {
    vi.spyOn(generatedLoaders['zh-CN'], 'account_team').mockResolvedValue({ default: {} });
    const { t } = await createServerTranslator({ locale: 'zh-CN', namespaces: ['account_team'] });
    expect(t('account_team:log_time')).toBe('Operation time');
    expect(t('account_team:missing_review_key')).toBe('account_team:missing_review_key');
    expect(t('account_team:missing_review_key', { defaultValue: 'Fallback' })).toBe('Fallback');
  });

  it('keeps concurrent requests in different languages independent', async () => {
    const [chinese, english] = await Promise.all([
      createServerTranslator({ locale: 'zh-CN', namespaces: ['account_team'] }),
      createServerTranslator({ locale: 'en', namespaces: ['account_team'] })
    ]);
    expect(chinese.t('account_team:log_time')).toBe('操作时间');
    expect(english.t('account_team:log_time')).toBe('Operation time');
    expect(chinese.t('account_team:log_time')).toBe('操作时间');
  });

  it('propagates resource loading failures so callers cannot export untranslated content', async () => {
    const error = new Error('resource unavailable');
    vi.spyOn(generatedLoaders.en, 'account_team').mockRejectedValue(error);
    await expect(
      createServerTranslator({ locale: 'en', namespaces: ['account_team'] })
    ).rejects.toBe(error);
  });
});
