import {
  getFastGPTDocsLocale,
  getPublishedDocsLocales,
  isPreviewDocsSite
} from '@/lib/fastgpt-home-url';
import { i18n } from '@/lib/i18n';
import { source } from '@/lib/source';
import { enhancedTokenizer } from '@/lib/tokenizer';
import { createFromSource } from 'fumadocs-core/search/server';

const publishedLocales = getPublishedDocsLocales();
const publishedLocaleSet = new Set<string>(publishedLocales);

const isSearchablePage = (page: ReturnType<typeof source.getPage>) =>
  page !== undefined &&
  !page.data.deprecated &&
  !/^toc(?:\.en)?\.mdx$/.test(page.data._file.path);

const searchableSource: typeof source = {
  ...source,
  _i18n: {
    ...source._i18n,
    defaultLanguage: isPreviewDocsSite() ? i18n.defaultLanguage : getFastGPTDocsLocale(),
    languages: publishedLocales
  },
  getPages(language) {
    if (language !== undefined && !publishedLocaleSet.has(language)) {
      return [];
    }
    return source.getPages(language).filter(isSearchablePage);
  },
  getLanguages() {
    return source
      .getLanguages()
      .filter((entry) => publishedLocaleSet.has(entry.language))
      .map((entry) => ({
        ...entry,
        pages: entry.pages.filter(isSearchablePage)
      }));
  }
};

export const { GET } = createFromSource(searchableSource, {
  // 使用中文分词器时不能设置 language 选项
  localeMap: {
    en: {
      language: 'english'
    },
    'zh-CN': {
      components: {
        tokenizer: enhancedTokenizer()
      },
      search: {
        threshold: 0.2,
        tolerance: 0
      }
    }
  }
});
