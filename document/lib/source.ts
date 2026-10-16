import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';
import { normalizePageTreeSections } from './page-tree';
import { icons } from 'lucide-react';
import { createElement } from 'react';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  i18n,
  // it assigns a URL to your pages
  baseUrl: '/',
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

// Share section ownership between the sidebar, breadcrumbs, and adjacent-page navigation.
for (const locale of i18n.languages) {
  source.pageTree[locale] = normalizePageTreeSections(source.pageTree[locale]);
}
