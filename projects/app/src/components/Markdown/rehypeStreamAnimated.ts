const STREAM_ANIMATED_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);
const STREAM_ANIMATED_SKIP_TAGS = new Set(['pre', 'code', 'table', 'svg']);
const DEFAULT_STREAMING_TAIL_MAX_LENGTH = 64;
const DEFAULT_STREAMING_TAIL_TAG_NAME = 'stream-tail';
const STREAMING_MARKDOWN_SYNTAX_CHARS = new Set('*_~`[]()>#+-|\\');

type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, any>;
  children?: HastNode[];
};
type HastText = {
  type: 'text';
  value: string;
};
type HastNode =
  | HastElement
  | HastText
  | {
      type: string;
      [key: string]: any;
    };
type HastRoot = {
  type: 'root';
  children?: HastNode[];
};

/**
 * 计算相对上一次已提交 Markdown 新增可见尾部的 Unicode code point 数量。
 *
 * 只接受纯 append，避免 Markdown 尾部隐藏、内容替换或会话切换时把旧正文误判为新增内容。
 * 首尾空白和纯 Markdown 控制标记不产生可见动画，返回值有上限，保证单次大 chunk 也只
 * 创建固定规模的动画节点。
 */
export const getStreamingAppendLength = ({
  previousSource,
  currentSource,
  maxLength = DEFAULT_STREAMING_TAIL_MAX_LENGTH
}: {
  previousSource: string;
  currentSource: string;
  maxLength?: number;
}) => {
  if (!currentSource.startsWith(previousSource)) return 0;

  const appendedSource = currentSource.slice(previousSource.length).trim();
  if (!appendedSource) return 0;

  const appendedCodePoints = Array.from(appendedSource);
  if (appendedCodePoints.every((codePoint) => STREAMING_MARKDOWN_SYNTAX_CHARS.has(codePoint))) {
    return 0;
  }

  return Math.min(appendedCodePoints.length, maxLength);
};

/**
 * 只包装最后一个 Markdown 文本块的最新尾部，供流式淡入 renderer 使用。
 *
 * 与原字符级实现不同，本插件不会重写累计全文。它从最后一个可见 block 的末尾向前消费
 * `tailLength` 个 code point，一个原始 text node 最多生成一个 tail element。代码、表格、
 * SVG 和 KaTeX 是边界；遇到这些节点后不会继续向前包装旧正文。
 */
export const rehypeStreamAnimated = ({
  tailLength,
  tailTagName = DEFAULT_STREAMING_TAIL_TAG_NAME
}: {
  tailLength: number;
  tailTagName?: string;
}) => {
  return (tree: HastRoot) => {
    if (tailLength <= 0) return;

    const isHastElement = (node: HastNode): node is HastElement =>
      node.type === 'element' && typeof (node as HastElement).tagName === 'string';
    const isHastText = (node: HastNode): node is HastText =>
      node.type === 'text' && typeof (node as HastText).value === 'string';
    const hasClass = (node: HastElement, cls: string) => {
      const className = node.properties?.className;
      if (Array.isArray(className)) return className.some((item) => String(item).includes(cls));
      if (typeof className === 'string') return className.includes(cls);
      return false;
    };
    const shouldSkip = (node: HastElement) =>
      STREAM_ANIMATED_SKIP_TAGS.has(node.tagName) || hasClass(node, 'katex');
    const hasRenderableText = (node: HastElement): boolean => {
      if (shouldSkip(node)) return false;

      return !!node.children?.some((child) => {
        if (isHastText(child)) return child.value.length > 0;
        return isHastElement(child) && hasRenderableText(child);
      });
    };
    let lastTextBlock: HastElement | undefined;
    const findLastTextBlock = (node: HastNode, activeTextBlock?: HastElement) => {
      if (!isHastElement(node)) return;
      if (shouldSkip(node)) {
        // 最近候选是当前文本块本身时，跳过节点可能只是行内内容；若候选来自嵌套 block，
        // 同级代码、表格或公式则表示尾部已越过候选，不能回退动画更早正文。
        if (lastTextBlock !== activeTextBlock) lastTextBlock = undefined;
        return;
      }

      const renderableText = hasRenderableText(node);
      const isTextBlock = STREAM_ANIMATED_BLOCK_TAGS.has(node.tagName) && renderableText;
      if (isTextBlock) {
        lastTextBlock = node;
      }
      const nextActiveTextBlock = isTextBlock ? node : activeTextBlock;
      node.children?.forEach((child) => findLastTextBlock(child, nextActiveTextBlock));
    };
    tree.children?.forEach((child) => findLastTextBlock(child));
    if (!lastTextBlock) return;

    let remainingLength = tailLength;

    /** 从尾部反向包装；false 表示遇到不可跨越的渲染边界。 */
    const wrapTail = (node: HastElement): boolean => {
      if (!node.children) return true;

      for (let index = node.children.length - 1; index >= 0 && remainingLength > 0; index--) {
        const child = node.children[index];

        if (isHastText(child)) {
          const codePoints = Array.from(child.value);
          if (codePoints.length === 0) continue;

          const animatedLength = Math.min(codePoints.length, remainingLength);
          const stableText = codePoints.slice(0, -animatedLength).join('');
          const animatedText = codePoints.slice(-animatedLength).join('');
          const nextChildren: HastNode[] = [];

          if (stableText) {
            nextChildren.push({ type: 'text', value: stableText });
          }
          nextChildren.push({
            type: 'element',
            tagName: tailTagName,
            properties: {},
            children: [{ type: 'text', value: animatedText }]
          });

          node.children.splice(index, 1, ...nextChildren);
          remainingLength -= animatedLength;
          continue;
        }

        if (!isHastElement(child)) continue;
        if (shouldSkip(child)) return false;
        if (!wrapTail(child)) return false;
      }

      return true;
    };

    wrapTail(lastTextBlock);
  };
};
