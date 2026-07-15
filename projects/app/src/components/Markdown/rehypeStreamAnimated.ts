const STREAM_ANIMATED_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);
const STREAM_ANIMATED_SKIP_TAGS = new Set(['pre', 'code', 'table', 'svg']);

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

export type StreamAnimatedRuntime = {
  births: number[];
  /**
   * 字符首次渲染时冻结的 style。后续 block 重渲染不能改写 animation-delay，
   * 否则浏览器会重新启动正在执行的淡入动画。
   */
  styles: Array<string | null | undefined>;
};

type RehypeStreamAnimatedOptions = {
  fadeDuration: number;
  nowMs?: number;
  revealed?: boolean;
  runtime?: StreamAnimatedRuntime;
};

export const getStreamAnimationNow = () =>
  typeof performance === 'undefined' || typeof performance.now !== 'function'
    ? Date.now()
    : performance.now();

/**
 * 为流式 Markdown block 建立稳定的字符 DOM 时间线。
 *
 * 每个可见字符从 block 起点获得固定下标，旧 span 会在 append 更新中保持位置和 style，
 * 只有新增字符会追加节点并执行淡入。列表项会作为一个 block 递归处理，避免 `li` 内的
 * paragraph 再次包装；代码、表格、SVG 和 KaTeX 保持原始 DOM。
 */
export const rehypeStreamAnimated = ({
  fadeDuration,
  nowMs,
  revealed = false,
  runtime
}: RehypeStreamAnimatedOptions) => {
  return (tree: HastRoot) => {
    let globalCharIndex = 0;
    const now = nowMs ?? getStreamAnimationNow();

    const isHastElement = (node: HastNode): node is HastElement =>
      node.type === 'element' && typeof (node as HastElement).tagName === 'string';
    const hasClass = (node: HastElement, cls: string) => {
      const className = node.properties?.className;
      if (Array.isArray(className)) return className.some((item) => String(item).includes(cls));
      if (typeof className === 'string') return className.includes(cls);
      return false;
    };
    const shouldSkip = (node: HastElement) =>
      STREAM_ANIMATED_SKIP_TAGS.has(node.tagName) || hasClass(node, 'katex');

    const resolveStyle = (index: number): string | null => {
      if (!runtime) return null;

      const cachedStyle = runtime.styles[index];
      if (cachedStyle !== undefined) return cachedStyle;

      const birthTime = runtime.births[index];
      const style = (() => {
        if (birthTime === undefined) return null;

        const elapsed = now - birthTime;
        if (elapsed >= fadeDuration) return null;

        // 负 delay 表示从已流逝的位置继续动画，正 delay 表示同一 commit 内的错峰字符。
        return `animation-delay:${-elapsed}ms`;
      })();
      runtime.styles[index] = style;
      return style;
    };

    const buildCharacter = (value: string): HastElement => {
      const style = resolveStyle(globalCharIndex);
      const className =
        revealed || style === null ? 'stream-char stream-char-revealed' : 'stream-char';
      const properties: Record<string, any> = { className };
      if (style !== null) properties.style = style;
      globalCharIndex++;

      return {
        type: 'element',
        tagName: 'span',
        properties,
        children: [{ type: 'text', value }]
      };
    };

    const wrapText = (node: HastElement) => {
      const children: HastNode[] = [];

      for (const child of node.children) {
        if (child.type === 'text' && typeof child.value === 'string') {
          for (const character of child.value) {
            children.push(buildCharacter(character));
          }
          continue;
        }

        if (isHastElement(child) && !shouldSkip(child)) {
          wrapText(child);
        }
        children.push(child);
      }

      node.children = children;
    };

    const visit = (node: HastNode) => {
      if (!isHastElement(node) || shouldSkip(node)) return;

      if (STREAM_ANIMATED_BLOCK_TAGS.has(node.tagName)) {
        wrapText(node);
        return;
      }

      node.children.forEach(visit);
    };

    tree.children?.forEach(visit);
  };
};
