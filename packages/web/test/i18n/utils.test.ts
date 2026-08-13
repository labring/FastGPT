import { describe, expect, it } from 'vitest';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { getRequiredI18nLanguages } from '@fastgpt/web/i18n/utils';

describe('getRequiredI18nLanguages', () => {
  it('returns only English when English is the active language', () => {
    expect(getRequiredI18nLanguages(LangEnum.en)).toEqual([LangEnum.en]);
  });

  it.each([LangEnum.zh_CN, LangEnum.zh_Hant])('appends English fallback for %s', (language) => {
    expect(getRequiredI18nLanguages(language)).toEqual([language, LangEnum.en]);
  });
});
