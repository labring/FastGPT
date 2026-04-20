import { describe, it, expect } from 'vitest';
import { defaultProvider, formatModelProviders } from '@fastgpt/global/core/ai/provider';

// Mock I18nStringStrictType for testing
type MockI18nStringStrictType = {
  en: string;
  'zh-CN'?: string;
  'zh-Hant'?: string;
};

describe('defaultProvider', () => {
  it('should have correct default values', () => {
    expect(defaultProvider).toEqual({
      id: 'Other',
      name: 'Other',
      avatar: 'model/huggingface',
      order: 999
    });
  });

  it('should have all required properties', () => {
    expect(defaultProvider).toHaveProperty('id');
    expect(defaultProvider).toHaveProperty('name');
    expect(defaultProvider).toHaveProperty('avatar');
    expect(defaultProvider).toHaveProperty('order');
  });
});

describe('formatModelProviders', () => {
  const mockData: { provider: string; value: MockI18nStringStrictType; avatar: string }[] = [
    {
      provider: 'openai',
      value: { en: 'OpenAI', 'zh-CN': 'OpenAI 中文', 'zh-Hant': 'OpenAI 繁體' },
      avatar: 'model/openai'
    },
    {
      provider: 'anthropic',
      value: { en: 'Anthropic', 'zh-CN': 'Anthropic 中文', 'zh-Hant': 'Anthropic 繁體' },
      avatar: 'model/anthropic'
    }
  ];

  describe('ModelProviderListCache', () => {
    it('should generate list cache for all supported languages', () => {
      const result = formatModelProviders(mockData as any);

      expect(result.ModelProviderListCache).toHaveProperty('en');
      expect(result.ModelProviderListCache).toHaveProperty('zh-CN');
      expect(result.ModelProviderListCache).toHaveProperty('zh-Hant');
    });

    it('should format list with correct English names', () => {
      const result = formatModelProviders(mockData as any);
      const enList = result.ModelProviderListCache.en;

      expect(enList).toHaveLength(2);
      expect(enList[0]).toEqual({
        id: 'openai',
        name: 'OpenAI',
        avatar: 'model/openai',
        order: 0
      });
      expect(enList[1]).toEqual({
        id: 'anthropic',
        name: 'Anthropic',
        avatar: 'model/anthropic',
        order: 1
      });
    });

    it('should format list with correct Chinese Simplified names', () => {
      const result = formatModelProviders(mockData as any);
      const zhCNList = result.ModelProviderListCache['zh-CN'];

      expect(zhCNList).toHaveLength(2);
      expect(zhCNList[0].name).toBe('OpenAI 中文');
      expect(zhCNList[1].name).toBe('Anthropic 中文');
    });

    it('should format list with correct Chinese Traditional names', () => {
      const result = formatModelProviders(mockData as any);
      const zhHantList = result.ModelProviderListCache['zh-Hant'];

      expect(zhHantList).toHaveLength(2);
      expect(zhHantList[0].name).toBe('OpenAI 繁體');
      expect(zhHantList[1].name).toBe('Anthropic 繁體');
    });

    it('should preserve order based on array index', () => {
      const result = formatModelProviders(mockData as any);
      const enList = result.ModelProviderListCache.en;

      expect(enList[0].order).toBe(0);
      expect(enList[1].order).toBe(1);
    });
  });

  describe('ModelProviderMapCache', () => {
    it('should generate map cache for all supported languages', () => {
      const result = formatModelProviders(mockData as any);

      expect(result.ModelProviderMapCache).toHaveProperty('en');
      expect(result.ModelProviderMapCache).toHaveProperty('zh-CN');
      expect(result.ModelProviderMapCache).toHaveProperty('zh-Hant');
    });

    it('should create map with provider id as key', () => {
      const result = formatModelProviders(mockData as any);
      const enMap = result.ModelProviderMapCache.en;

      expect(enMap).toHaveProperty('openai');
      expect(enMap).toHaveProperty('anthropic');
    });

    it('should format map with correct English values', () => {
      const result = formatModelProviders(mockData as any);
      const enMap = result.ModelProviderMapCache.en;

      expect(enMap.openai).toEqual({
        id: 'openai',
        name: 'OpenAI',
        avatar: 'model/openai',
        order: 0
      });
    });

    it('should format map with correct Chinese values', () => {
      const result = formatModelProviders(mockData as any);
      const zhCNMap = result.ModelProviderMapCache['zh-CN'];

      expect(zhCNMap.openai.name).toBe('OpenAI 中文');
      expect(zhCNMap.anthropic.name).toBe('Anthropic 中文');
    });
  });

  describe('getLocalizedName fallback behavior', () => {
    it('should fallback to English when translation is missing', () => {
      const dataWithMissingTranslation: {
        provider: string;
        value: MockI18nStringStrictType;
        avatar: string;
      }[] = [
        {
          provider: 'test',
          value: { en: 'Test Provider' }, // Missing zh-CN and zh-Hant
          avatar: 'model/test'
        }
      ];

      const result = formatModelProviders(dataWithMissingTranslation as any);

      // Should fallback to English for missing translations
      expect(result.ModelProviderListCache['zh-CN'][0].name).toBe('Test Provider');
      expect(result.ModelProviderListCache['zh-Hant'][0].name).toBe('Test Provider');
    });

    it('should use specific language when available', () => {
      const dataWithAllTranslations: {
        provider: string;
        value: MockI18nStringStrictType;
        avatar: string;
      }[] = [
        {
          provider: 'test',
          value: { en: 'English', 'zh-CN': '简体中文', 'zh-Hant': '繁體中文' },
          avatar: 'model/test'
        }
      ];

      const result = formatModelProviders(dataWithAllTranslations as any);

      expect(result.ModelProviderListCache.en[0].name).toBe('English');
      expect(result.ModelProviderListCache['zh-CN'][0].name).toBe('简体中文');
      expect(result.ModelProviderListCache['zh-Hant'][0].name).toBe('繁體中文');
    });
  });

  describe('edge cases', () => {
    it('should handle empty data array', () => {
      const result = formatModelProviders([]);

      expect(result.ModelProviderListCache.en).toEqual([]);
      expect(result.ModelProviderListCache['zh-CN']).toEqual([]);
      expect(result.ModelProviderListCache['zh-Hant']).toEqual([]);
      expect(result.ModelProviderMapCache.en).toEqual({});
      expect(result.ModelProviderMapCache['zh-CN']).toEqual({});
      expect(result.ModelProviderMapCache['zh-Hant']).toEqual({});
    });

    it('should handle single provider', () => {
      const singleProvider: {
        provider: string;
        value: MockI18nStringStrictType;
        avatar: string;
      }[] = [
        {
          provider: 'single',
          value: { en: 'Single Provider' },
          avatar: 'model/single'
        }
      ];

      const result = formatModelProviders(singleProvider as any);

      expect(result.ModelProviderListCache.en).toHaveLength(1);
      expect(result.ModelProviderMapCache.en).toHaveProperty('single');
    });

    it('should handle providers with special characters in id', () => {
      const specialProvider: {
        provider: string;
        value: MockI18nStringStrictType;
        avatar: string;
      }[] = [
        {
          provider: 'provider-with-dash',
          value: { en: 'Provider With Dash' },
          avatar: 'model/special'
        },
        {
          provider: 'provider_with_underscore',
          value: { en: 'Provider With Underscore' },
          avatar: 'model/special'
        }
      ];

      const result = formatModelProviders(specialProvider as any);

      expect(result.ModelProviderMapCache.en['provider-with-dash']).toBeDefined();
      expect(result.ModelProviderMapCache.en['provider_with_underscore']).toBeDefined();
    });
  });
});
