import { useMemo } from 'react';

const STREAM_ANIMATED_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const STREAM_ANIMATED_SKIP_TAGS = new Set(['pre', 'code', 'table', 'svg']);
const STREAM_ANIMATED_LIST_INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'cite',
  'del',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u'
]);

type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, any>;
  children?: HastNode[];
};
type HastNode =
  | HastElement
  | {
      type: 'text';
      value: string;
    }
  | {
      type: string;
      [key: string]: any;
    };
type HastRoot = {
  type: 'root';
  children?: HastNode[];
};

/**
 * 流式输出时按 Lobe UI 的方式把新增文本拆成字符 span 做淡入动画。
 * 只处理段落、标题和列表里的文本，跳过代码块、表格、公式等高复杂度内容，避免流式阶段 DOM 过重。
 */
export const rehypeStreamAnimated = ({ className = 'stream-char' }: { className?: string }) => {
  return (tree: HastRoot) => {
    const isHastElement = (node: HastNode): node is HastElement => {
      return node.type === 'element' && typeof (node as HastElement).tagName === 'string';
    };

    const hasClass = (node: HastElement, cls: string) => {
      const className = node.properties?.className;
      if (Array.isArray(className)) return className.some((item) => String(item).includes(cls));
      if (typeof className === 'string') return className.includes(cls);
      return false;
    };

    const shouldSkip = (node: HastElement) => {
      return STREAM_ANIMATED_SKIP_TAGS.has(node.tagName) || hasClass(node, 'katex');
    };

    const createStreamCharNode = (char: string): HastElement => {
      return {
        type: 'element',
        tagName: 'span',
        properties: { className },
        children: [{ type: 'text', value: char }]
      };
    };

    const wrapText = (node: HastElement) => {
      const newChildren: HastNode[] = [];

      node.children?.forEach((child) => {
        if (child.type === 'text') {
          for (const char of child.value) {
            newChildren.push(createStreamCharNode(char));
          }
          return;
        }

        if (isHastElement(child) && !shouldSkip(child)) {
          wrapText(child);
        }
        newChildren.push(child);
      });

      node.children = newChildren;
    };

    const wrapListItemText = (node: HastElement) => {
      const newChildren: HastNode[] = [];

      node.children?.forEach((child) => {
        if (child.type === 'text') {
          for (const char of child.value) {
            newChildren.push(createStreamCharNode(char));
          }
          return;
        }

        if (
          isHastElement(child) &&
          (child.tagName === 'p' || STREAM_ANIMATED_LIST_INLINE_TAGS.has(child.tagName))
        ) {
          wrapText(child);
        }
        newChildren.push(child);
      });

      node.children = newChildren;
    };

    const visitElement = (node: HastNode): 'skip' | undefined => {
      if (!isHastElement(node)) return;
      if (shouldSkip(node)) return 'skip';
      if (node.tagName === 'li') {
        wrapListItemText(node);
        return 'skip';
      }
      if (STREAM_ANIMATED_BLOCK_TAGS.has(node.tagName)) {
        wrapText(node);
        return 'skip';
      }

      node.children?.forEach((child) => {
        if (visitElement(child) === 'skip') return;
      });
    };

    tree.children?.forEach((child) => {
      visitElement(child);
    });
  };
};

/**
 * 返回流式 Markdown 字符淡入插件。
 * 不在 React render 期间读写 ref；依赖 React 复用已存在的字符 span，仅让新增字符节点触发 CSS animation。
 */
export const useStreamAnimatedRehypePlugin = () => {
  return useMemo(() => [rehypeStreamAnimated, { className: 'stream-char' }], []);
};
