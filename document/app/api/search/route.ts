import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// Force English as the search language
export const { GET } = createFromSource(source, {
  language: 'english'
});
