import { describe, expect, it } from 'vitest';
import { I18nStringSchema } from '@fastgpt/global/core/plugin/type';

describe('plugin I18nStringSchema', () => {
  it('requires Simplified Chinese translations', () => {
    expect(() => I18nStringSchema.parse({ en: 'English' })).toThrow();
  });

  it('accepts English and Simplified Chinese translations without Korean', () => {
    expect(
      I18nStringSchema.parse({
        en: 'English',
        'zh-CN': '简体中文'
      })
    ).toEqual({
      en: 'English',
      'zh-CN': '简体中文'
    });
  });
});
