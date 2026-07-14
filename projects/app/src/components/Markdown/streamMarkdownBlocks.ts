import RemarkMath from 'remark-math';
import RemarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

type MarkdownNodePosition = {
  start: { offset?: number };
  end: { offset?: number };
};

type MarkdownRoot = {
  children: Array<{
    type?: string;
    position?: MarkdownNodePosition;
  }>;
};

export type MarkdownBlock = {
  source: string;
  startOffset: number;
};

// Reuse the parser across renders; only the current source still needs to be parsed.
const markdownBlockParser = unified()
  .use(remarkParse)
  .use(RemarkMath)
  .use(RemarkGfm, { singleTilde: false });

/**
 * 按 Markdown 根级 block 的源码范围切分流式内容。
 *
 * 根级节点的 position 可以保留代码块、表格、列表和引用的完整语法，避免用空行
 * 切分破坏 Markdown 上下文。startOffset 用作 React key；追加输出时，已经完成的
 * block 会保持稳定，只有最后一个仍在增长的 block 需要重新渲染。
 */
export const splitMarkdownBlocks = (source: string): MarkdownBlock[] => {
  const root = markdownBlockParser.parse(source) as MarkdownRoot;

  // Reference links and GFM footnotes resolve against the complete document. Splitting
  // them into independent ReactMarkdown instances would make a definition invisible to
  // a paragraph in another block, so keep these messages on the original full-document path.
  if (
    root.children.some((node) => node.type === 'definition' || node.type === 'footnoteDefinition')
  ) {
    return source ? [{ source, startOffset: 0 }] : [];
  }

  const blocks = root.children.flatMap((node) => {
    const startOffset = node.position?.start.offset;
    const endOffset = node.position?.end.offset;

    if (
      typeof startOffset !== 'number' ||
      typeof endOffset !== 'number' ||
      endOffset <= startOffset
    ) {
      return [];
    }

    return [
      {
        source: source.slice(startOffset, endOffset),
        startOffset
      }
    ];
  });

  // A non-empty source can contain only whitespace, which the parser omits.
  // Keep one fallback block so the renderer preserves the existing empty-state behavior.
  if (blocks.length === 0 && source) {
    return [{ source, startOffset: 0 }];
  }

  return blocks;
};
