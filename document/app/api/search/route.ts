import { source } from '@/lib/source';
import { enhancedTokenizer } from '@/lib/tokenizer';
import { createFromSource } from 'fumadocs-core/search/server';

const isSearchablePage = (page: ReturnType<typeof source.getPage>) =>
  page !== undefined &&
  !page.data.deprecated &&
  !/^toc(?:\.en)?\.mdx$/.test(page.data._file.path);

const searchableSource: typeof source = {
  ...source,
  getPages(language) {
    return source.getPages(language).filter(isSearchablePage);
  },
  getLanguages() {
    return source.getLanguages().map((entry) => ({
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
