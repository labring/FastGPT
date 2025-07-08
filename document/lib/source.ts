import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  i18n,
  // it assigns a URL to your pages
  baseUrl: '/docs',
  source: docs.toFumadocsSource()
});
