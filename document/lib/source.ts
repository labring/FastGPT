import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';
import { getHostLocalePath } from './site';
import { icons } from 'lucide-react';
import { createElement } from 'react';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  i18n,
  // it assigns a URL to your pages
  baseUrl: '/',
  // Domain default locale is unprefixed (io: en, cn: zh-CN); see lib/site.ts
  url: (slugs, locale) => getHostLocalePath(locale ?? i18n.defaultLanguage, `/${slugs.join('/')}`),
  source: docs.toFumadocsSource(),
  pageTree: {
    attachFile(node, file) {
      return {
        ...node,
        sidebarTag: file?.data.sidebarTag,
        upgradeTags: file?.data.upgradeTags
      };
    }
  },
  icon(iconName) {
    return iconName && icons[iconName as keyof typeof icons]
      ? createElement(icons[iconName as keyof typeof icons])
      : undefined;
  }
});
