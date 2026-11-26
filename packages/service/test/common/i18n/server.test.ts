import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleList } from '@fastgpt/global/common/i18n/type';
import { createServerTranslator } from '@fastgpt/service/common/i18n/server';
import * as i18next from 'i18next';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';

// 保留真实翻译行为，仅包装实例工厂，以验证复用次数和初始化失败后的恢复。
vi.mock('i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18next')>();
  return { ...actual, createInstance: vi.fn(actual.createInstance) };
});

describe('createServerTranslator', () => {
  let resourceLoaders: typeof generatedLoaders;
  beforeEach(() => {
    vi.mocked(i18next.createInstance).mockClear();
    resourceLoaders = { ...generatedLoaders };
    for (const locale of LocaleList) {
      resourceLoaders[locale] = { ...generatedLoaders[locale] };
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(LocaleList)('translates requested namespaces in %s', async (locale) => {
    const { t } = await createServerTranslator({
      resourceLoaders,
      locale,
      namespaces: ['account_team']
    });
    expect(t('account_team:log_time')).not.toContain('account_team:');
    expect(t('account_team:log_type')).not.toContain('account_team:');
    expect(t('account_team:type.Workflow bot')).not.toContain('account_team:');
  });

  it('includes common by default and supports flat keys containing dots', async () => {
    const { t } = await createServerTranslator({
      resourceLoaders,
      locale: 'zh-CN',
      namespaces: []
    });
    expect(t('Confirm')).toBe('确认');
    expect(t('common:error.missingParams')).toBe('参数缺失');
  });

  it('interpolates user values without HTML escaping or translating their content', async () => {
    const { t } = await createServerTranslator({
      resourceLoaders,
      locale: 'zh-CN',
      namespaces: ['account_team']
    });
    const name = '<用户> & https://example.com/路径\ncommon:Confirm';
    expect(t('account_team:log_login', { name })).toBe(`【${name}】登录了系统`);
  });

  it('falls back to English for missing translations, then the original key or explicit default', async () => {
    vi.spyOn(resourceLoaders['zh-CN'], 'account_team').mockResolvedValue({ default: {} });
    const { t } = await createServerTranslator({
      resourceLoaders,
      locale: 'zh-CN',
      namespaces: ['account_team']
    });
    expect(t('account_team:log_time')).toBe('Operation time');
    expect(t('account_team:missing_review_key')).toBe('account_team:missing_review_key');
    expect(t('account_team:missing_review_key', { defaultValue: 'Fallback' })).toBe('Fallback');
  });

  it('keeps concurrent requests in different languages independent', async () => {
    const [chinese, english] = await Promise.all([
      createServerTranslator({
        resourceLoaders,
        locale: 'zh-CN',
        namespaces: ['account_team']
      }),
      createServerTranslator({
        resourceLoaders,
        locale: 'en',
        namespaces: ['account_team']
      })
    ]);
    expect(chinese.t('account_team:log_time')).toBe('操作时间');
    expect(english.t('account_team:log_time')).toBe('Operation time');
    expect(chinese.t('account_team:log_time')).toBe('操作时间');
  });

  it.each(['sync', 'async'])(
    'retries a %s resource failure without reloading successful resources',
    async (failure) => {
      const error = new Error('resource unavailable');
      const common = vi.spyOn(resourceLoaders.en, 'common');
      const accountTeam = vi.spyOn(resourceLoaders.en, 'account_team');
      if (failure === 'sync') {
        accountTeam.mockImplementationOnce(() => {
          throw error;
        });
      } else {
        accountTeam.mockRejectedValueOnce(error);
      }
      await expect(
        createServerTranslator({
          resourceLoaders,
          locale: 'en',
          namespaces: ['account_team']
        })
      ).rejects.toBe(error);
      const { t } = await createServerTranslator({
        resourceLoaders,
        locale: 'en',
        namespaces: ['account_team']
      });
      expect(t('account_team:log_time')).toBe('Operation time');
      expect(accountTeam).toHaveBeenCalledTimes(2);
      expect(common).toHaveBeenCalledTimes(1);
    }
  );

  it('shares initialization and incremental resource loads across concurrent and repeated calls', async () => {
    const createInstance = vi.mocked(i18next.createInstance);
    const loaders = (['en', 'zh-CN'] as const).flatMap((locale) =>
      (['common', 'account_team', 'app'] as const).map((namespace) =>
        vi.spyOn(resourceLoaders[locale], namespace)
      )
    );
    const unused = vi.spyOn(resourceLoaders.en, 'workflow');
    const input = {
      resourceLoaders,
      locale: 'zh-CN' as const,
      namespaces: ['account_team' as const]
    };
    const [first, second, english] = await Promise.all([
      createServerTranslator(input),
      createServerTranslator({ ...input, namespaces: ['common', 'account_team', 'account_team'] }),
      createServerTranslator({ ...input, locale: 'en' })
    ]);
    await createServerTranslator({ ...input, namespaces: ['app', 'account_team'] });
    await createServerTranslator({ ...input, namespaces: ['account_team', 'app'] });
    expect(first.t('account_team:log_time')).toBe('操作时间');
    expect(second.t('account_team:log_time')).toBe('操作时间');
    expect(english.t('account_team:log_time')).toBe('Operation time');
    expect(createInstance).toHaveBeenCalledTimes(1);
    loaders.forEach((loader) => expect(loader).toHaveBeenCalledTimes(1));
    expect(unused).not.toHaveBeenCalled();
  });

  it('isolates different resource sources with the same locale and namespace', async () => {
    const otherLoaders = {
      ...resourceLoaders,
      'zh-CN': {
        ...resourceLoaders['zh-CN'],
        account_team: async () => ({ default: { log_time: '另一份文案' } })
      }
    };
    const input = { locale: 'zh-CN' as const, namespaces: ['account_team' as const] };
    const [first, second] = await Promise.all([
      createServerTranslator({ ...input, resourceLoaders }),
      createServerTranslator({ ...input, resourceLoaders: otherLoaders })
    ]);
    expect(first.t('account_team:log_time')).toBe('操作时间');
    expect(second.t('account_team:log_time')).toBe('另一份文案');
  });

  it('retries initialization after a rejected first attempt', async () => {
    const error = new Error('init failed');
    const instance = i18next.createInstance();
    vi.spyOn(instance, 'init').mockRejectedValueOnce(error);
    vi.mocked(i18next.createInstance).mockReturnValueOnce(instance);
    const input = { resourceLoaders, locale: 'en' as const, namespaces: ['account_team' as const] };
    await expect(createServerTranslator(input)).rejects.toBe(error);
    const { t } = await createServerTranslator(input);
    expect(t('account_team:log_time')).toBe('Operation time');
  });
});
