import React, { useMemo } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, type PluggableList } from 'unified';
import { VFile } from 'vfile';

type HastNode = {
  type: string;
  value?: string;
  children?: HastNode[];
};

type CachedMarkdownProps = {
  source: string;
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
  components?: Record<string, React.ElementType>;
};

const replaceRawNodes = (node: HastNode) => {
  if (!node.children) return;

  node.children = node.children.map((child) => {
    if (child.type === 'raw') {
      return {
        type: 'text',
        value: child.value || ''
      };
    }

    replaceRawNodes(child);
    return child;
  });
};

/**
 * 复用 Markdown processor，只重新 parse 当前流式 block。
 *
 * react-markdown 默认会在每次 render 中重新创建 unified processor。流式尾部每 50ms
 * 更新一次时，插件初始化本身会成为额外的主线程开销；这里让稳定的插件列表共享一个
 * processor，同时保留每次 source 更新都重新执行 parse/run 的语义。
 */
export const CachedMarkdown = React.memo(
  ({ source, remarkPlugins = [], rehypePlugins = [], components }: CachedMarkdownProps) => {
    const processor = useMemo(
      () =>
        unified()
          .use(remarkParse)
          .use(remarkPlugins)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypePlugins),
      [rehypePlugins, remarkPlugins]
    );

    const file = new VFile(source);
    const tree = processor.runSync(processor.parse(file), file) as HastNode;
    replaceRawNodes(tree);

    return toJsxRuntime(tree as any, {
      Fragment,
      components,
      ignoreInvalidStyle: true,
      jsx,
      jsxs,
      passKeys: true,
      passNode: true
    });
  }
);

CachedMarkdown.displayName = 'CachedMarkdown';
