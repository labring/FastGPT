import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';
import { normalizePageTreeSections } from './page-tree';
import { icons } from 'lucide-react';
import { createElement } from 'react';
import type { PageTree } from 'fumadocs-core/server';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
const contentSource = loader({
  i18n,
  // it assigns a URL to your pages
  baseUrl: '/',
  // Index all locale files first so draft default-locale pages keep published translations intact.
  source: docs.toFumadocsSource(),
  pageTree: {
    attachFile(node, file) {
      return {
        ...node,
        draft: file?.data.draft === true,
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

/** 按解析后的语言页面判断可见性；仅生产环境隐藏草稿，开发预览保留真实草稿状态。 */
const isVisible = (page: ReturnType<typeof contentSource.getPage>) =>
  page !== undefined && (process.env.NODE_ENV !== 'production' || page.data.draft !== true);

/** Remove draft items and empty folders from the page tree while preserving external links. */
const filterPageTree = (tree: PageTree.Root, language: string): PageTree.Root => {
  const draftUrls = new Set(
    contentSource
      .getPages(language)
      .filter((page) => !isVisible(page))
      .map((page) => page.url)
  );
  const filterPage = (node: PageTree.Item) =>
    draftUrls.has(node.url.split('#', 1)[0]) ? undefined : node;
  const filterNodes = (nodes: PageTree.Node[]): PageTree.Node[] =>
    nodes.flatMap<PageTree.Node>((node) => {
      if (node.type === 'page') {
        const page = filterPage(node);
        return page ? [page] : [];
      }
      if (node.type !== 'folder') return [node];

      const children = filterNodes(node.children);
      const index = node.index ? filterPage(node.index) : undefined;
      return index || children.length ? [{ ...node, index, children }] : [];
    });

  return { ...tree, children: filterNodes(tree.children) };
};

/** 按环境统一控制路由、导航与发现入口的草稿可见性，并规范化虚拟目录分组。 */
export const source: typeof contentSource = {
  ...contentSource,
  pageTree: Object.fromEntries(
    Object.entries(contentSource.pageTree).map(([language, tree]) => [
      language,
      normalizePageTreeSections(filterPageTree(tree, language))
    ])
  ),
  getPage(...args) {
    const page = contentSource.getPage(...args);
    return isVisible(page) ? page : undefined;
  },
  getPages(language) {
    return contentSource.getPages(language).filter(isVisible);
  },
  getNodePage(...args) {
    const page = contentSource.getNodePage(...args);
    return isVisible(page) ? page : undefined;
  },
  getPageByHref(...args) {
    const result = contentSource.getPageByHref.call(this, ...args);
    return result && isVisible(result.page) ? result : undefined;
  }
};
