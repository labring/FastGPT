const STREAM_ANIMATED_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);
const STREAM_ANIMATED_SKIP_TAGS = new Set(['pre', 'code', 'table', 'svg']);
const MAX_RETAINED_SEGMENTS = 14;
const MAX_ANIMATED_SEGMENT_LENGTH = 64;

type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, any>;
  children: HastNode[];
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

export type StreamAnimationSegment = {
  start: number;
  end: number;
  bornAt: number;
};

export type StreamAnimatedRuntime = {
  segments: StreamAnimationSegment[];
  visibleText: string;
};

type RehypeStreamAnimatedOptions = {
  fadeDuration: number;
  nowMs?: number;
  runtime: StreamAnimatedRuntime;
};

export const getStreamAnimationNow = () =>
  typeof performance === 'undefined' || typeof performance.now !== 'function'
    ? Date.now()
    : performance.now();

/**
 * 按可见文本维护固定数量的淡入区间。
 *
 * AST 因加粗闭合、列表追加等原因重建时，旧区间保留原 bornAt，只以负 delay 继续动画；
 * 可见文本发生修正时保留公共前缀，仅把改变后的后缀视为新内容。
 */
const syncVisibleSegments = ({
  fadeDuration,
  now,
  runtime,
  visibleText
}: {
  fadeDuration: number;
  now: number;
  runtime: StreamAnimatedRuntime;
  visibleText: string;
}) => {
  const previousCharacters = [...runtime.visibleText];
  const currentCharacters = [...visibleText];
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < previousCharacters.length &&
    commonPrefixLength < currentCharacters.length &&
    previousCharacters[commonPrefixLength] === currentCharacters[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  const retainedSegments = runtime.segments
    .filter((segment) => now - segment.bornAt < fadeDuration && segment.start < commonPrefixLength)
    .map((segment) => ({
      ...segment,
      end: Math.min(segment.end, commonPrefixLength)
    }))
    .filter((segment) => segment.end > segment.start);

  if (currentCharacters.length > commonPrefixLength) {
    retainedSegments.push({
      bornAt: now,
      end: currentCharacters.length,
      start: Math.max(commonPrefixLength, currentCharacters.length - MAX_ANIMATED_SEGMENT_LENGTH)
    });
  }

  runtime.visibleText = visibleText;
  runtime.segments = retainedSegments.slice(-MAX_RETAINED_SEGMENTS);
};

/**
 * 只包装最近新增的可见文本区间。
 *
 * 一个流式提交最多新增一个 segment，DOM 中最多保留固定数量的动画 span。代码、表格、
 * SVG 和 KaTeX 不参与动画；列表项作为动画 block 处理，新增下一项不会重置上一项 bornAt。
 */
export const rehypeStreamAnimated = ({
  fadeDuration,
  nowMs,
  runtime
}: RehypeStreamAnimatedOptions) => {
  return (tree: HastRoot) => {
    const now = nowMs ?? getStreamAnimationNow();
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

    const animatedBlocks: HastElement[] = [];
    const collectAnimatedBlocks = (node: HastNode) => {
      if (!isHastElement(node) || shouldSkip(node)) return;
      if (STREAM_ANIMATED_BLOCK_TAGS.has(node.tagName)) {
        animatedBlocks.push(node);
        return;
      }
      node.children.forEach(collectAnimatedBlocks);
    };
    tree.children?.forEach(collectAnimatedBlocks);

    const collectText = (node: HastNode): string => {
      if (isHastText(node)) return node.value;
      if (!isHastElement(node) || shouldSkip(node)) return '';
      return node.children.map(collectText).join('');
    };
    const visibleText = animatedBlocks.map(collectText).join('');
    syncVisibleSegments({ fadeDuration, now, runtime, visibleText });
    if (runtime.segments.length === 0) return;

    let visibleOffset = 0;
    const wrapTextNode = (node: HastText): HastNode[] => {
      const characters = [...node.value];
      const nodeStart = visibleOffset;
      const nodeEnd = nodeStart + characters.length;
      visibleOffset = nodeEnd;

      const boundaries = new Set([nodeStart, nodeEnd]);
      runtime.segments.forEach((segment) => {
        if (segment.end <= nodeStart || segment.start >= nodeEnd) return;
        boundaries.add(Math.max(segment.start, nodeStart));
        boundaries.add(Math.min(segment.end, nodeEnd));
      });
      const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

      return sortedBoundaries.slice(0, -1).map((start, index) => {
        const end = sortedBoundaries[index + 1];
        const value = characters.slice(start - nodeStart, end - nodeStart).join('');
        const segment = runtime.segments.find((item) => item.start <= start && item.end >= end);
        if (!segment) return { type: 'text', value };

        const elapsed = Math.max(now - segment.bornAt, 0);
        return {
          type: 'element',
          tagName: 'span',
          properties: {
            className: 'stream-tail',
            style: `animation-delay:${elapsed === 0 ? 0 : -elapsed}ms`
          },
          children: [{ type: 'text', value }]
        };
      });
    };

    const wrapVisibleText = (node: HastElement) => {
      const children: HastNode[] = [];
      node.children.forEach((child) => {
        if (isHastText(child)) {
          children.push(...wrapTextNode(child));
        } else {
          if (isHastElement(child) && !shouldSkip(child)) wrapVisibleText(child);
          children.push(child);
        }
      });
      node.children = children;
    };
    animatedBlocks.forEach(wrapVisibleText);
  };
};
