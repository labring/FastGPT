import { source } from '@/lib/source';
import { enhancedTokenizer } from '@/lib/tokenizer';
import { createFromSource } from 'fumadocs-core/search/server';

export const { GET } = createFromSource(source, {
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
        threshold: 0,
        tolerance: 0
      }
    }
  }
});
