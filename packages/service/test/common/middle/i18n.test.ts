import { describe, expect, it } from 'vitest';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { FASTGPT_LANGUAGE_HEADER } from '@fastgpt/global/common/system/constants';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

const request = (headers: Record<string, string | string[] | undefined>) => ({ headers }) as any;

describe('getLocale', () => {
  it('prefers the language Cookie over the custom request header', () => {
    expect(
      getLocale(
        request({
          cookie: 'NEXT_LOCALE=zh-CN',
          [FASTGPT_LANGUAGE_HEADER]: 'en'
        })
      )
    ).toBe(LangEnum.zh_CN);
  });

  it('uses and normalizes the custom request header when Cookie is absent', () => {
    expect(getLocale(request({ [FASTGPT_LANGUAGE_HEADER]: 'zh-TW' }))).toBe(LangEnum.zh_Hant);
    expect(getLocale(request({ [FASTGPT_LANGUAGE_HEADER]: 'en-US' }))).toBe(LangEnum.en);
  });

  it('falls back to English for unsupported or missing languages', () => {
    expect(getLocale(request({ [FASTGPT_LANGUAGE_HEADER]: 'fr-FR' }))).toBe(LangEnum.en);
    expect(getLocale(request({ 'accept-language': 'zh-CN' }))).toBe(LangEnum.en);
  });

  it('accepts the first custom header value when Node exposes an array', () => {
    expect(getLocale(request({ [FASTGPT_LANGUAGE_HEADER]: ['zh-Hant', 'en'] }))).toBe(
      LangEnum.zh_Hant
    );
  });
});
