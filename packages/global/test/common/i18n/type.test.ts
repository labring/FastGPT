import { describe, expect, it } from 'vitest';
import { I18nStringSchema } from '@fastgpt/global/common/i18n/type';

describe('I18nStringSchema', () => {
  it('accepts Korean translations', () => {
    expect(
      I18nStringSchema.parse({
        en: 'Hello',
        'ko-KR': '안녕하세요'
      })
    ).toEqual({
      en: 'Hello',
      'ko-KR': '안녕하세요'
    });
  });
});
