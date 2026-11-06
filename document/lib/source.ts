import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';
import { icons } from 'lucide-react';
import { createElement } from 'react';
import type { PageTree } from 'fumadocs-core/server';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
const contentSource = loader({
  i18n,
  // it assigns a URL to your pages
  baseUrl: '/',
  // 先保留所有语言文件完成索引，避免删除默认语言草稿时连带丢失已发布翻译。
  source: docs.toFumadocsSource(),
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

/** 按最终解析到的语言页面判断发布状态；缺少翻译仍可回退，显式草稿不能回退。 */
const isPublished = (page: ReturnType<typeof contentSource.getPage>) =>
  page !== undefined && page.data.draft !== true;

/** 删除草稿导航及空目录；手工配置的外部链接继续保留。 */
const filterPageTree = (tree: PageTree.Root, language: string): PageTree.Root => {
  const draftUrls = new Set(
    contentSource.getPages(language).filter((page) => !isPublished(page)).map((page) => page.url)
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

/** 在语言索引之后统一隐藏草稿，所有查询、发现入口和静态参数共用发布状态。 */
export const source: typeof contentSource = {
  ...contentSource,
  pageTree: Object.fromEntries(
    Object.entries(contentSource.pageTree).map(([language, tree]) => [
      language,
      filterPageTree(tree, language)
    ])
  ),
  getPage(...args) {
    const page = contentSource.getPage(...args);
    return isPublished(page) ? page : undefined;
  },
  getPages(language) {
    return contentSource.getPages(language).filter(isPublished);
  },
  getNodePage(...args) {
    const page = contentSource.getNodePage(...args);
    return isPublished(page) ? page : undefined;
  },
  getPageByHref(...args) {
    const result = contentSource.getPageByHref.call(this, ...args);
    return result && isPublished(result.page) ? result : undefined;
  }
};
