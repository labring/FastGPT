import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';
import { icons } from 'lucide-react';
import { createElement } from 'react';

const docsSource = docs.toFumadocsSource();

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  i18n,
  // it assigns a URL to your pages
  baseUrl: '/',
  source: {
    ...docsSource,
    // 在统一内容源排除草稿，路由、导航、搜索、sitemap 和静态导出保持一致。
    files: () => {
      const files = typeof docsSource.files === 'function' ? docsSource.files() : docsSource.files;
      return files.filter(
        (file) =>
          file.type !== 'page' ||
          !(
            typeof file.data === 'object' &&
            file.data !== null &&
            'draft' in file.data &&
            file.data.draft === true
          )
      );
    }
  },
  pageTree: {
    attachFile(node, file) {
      return {
        ...node,
        deprecated: file?.data.deprecated,
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
