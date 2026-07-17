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
  revealClock?: { lastTime: number };
  /**
   * 字符首次渲染时冻结的 style。后续 block 重渲染不能改写 animation-delay，
   * 否则浏览器会重新启动正在执行的淡入动画。
   */
  styles: Array<string | null | undefined>;
  visibleText?: string;
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

const STREAM_CHAR_DELAY_MS = 18;
const MIN_STREAM_CHAR_PACE_MS = 2;
const MIN_REVEAL_GAP_MS = 16;
const MAX_REVEAL_GAP_MS = 160;

/**
 * 按最终参与动画的可见文本扩展字符时间线。
 *
 * Markdown 控制符和流式修复器补出的闭合符不会进入 visibleText，因此不会提前占用
 * 新字符的动画下标。可见文本发生非追加变化时只保留公共前缀，兼容尾部 AST 修正。
 */
const syncVisibleTextTimeline = ({
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
  const currentCharacters = [...visibleText];

  // 兼容调用方手动提供 births 的场景；生产 runtime 会同时初始化这两个字段。
  if (!runtime.revealClock || runtime.visibleText === undefined) {
    runtime.visibleText = visibleText;
    return;
  }

  const previousCharacters = [...runtime.visibleText];
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < previousCharacters.length &&
    commonPrefixLength < currentCharacters.length &&
    previousCharacters[commonPrefixLength] === currentCharacters[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  if (commonPrefixLength < previousCharacters.length) {
    runtime.births.length = commonPrefixLength;
    runtime.styles.length = commonPrefixLength;
  }

  runtime.visibleText = visibleText;
  if (runtime.births.length >= currentCharacters.length) {
    runtime.births.length = currentCharacters.length;
    runtime.styles.length = currentCharacters.length;
    return;
  }

  const newCharacters = currentCharacters.length - runtime.births.length;
  const revealGap = Math.min(
    Math.max(now - runtime.revealClock.lastTime, MIN_REVEAL_GAP_MS),
    MAX_REVEAL_GAP_MS
  );
  const pace = Math.min(
    STREAM_CHAR_DELAY_MS,
    Math.max(revealGap / newCharacters, MIN_STREAM_CHAR_PACE_MS)
  );
  const latestBirthTime = now + revealGap + fadeDuration;

  for (let index = runtime.births.length; index < currentCharacters.length; index++) {
    const previousBirthTime = index > 0 ? runtime.births[index - 1] : now - pace;
    runtime.births.push(Math.min(latestBirthTime, Math.max(previousBirthTime + pace, now)));
  }
  runtime.revealClock.lastTime = now;
};

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

    const collectText = (node: HastElement): string =>
      node.children
        .map((child) => {
          if (child.type === 'text' && typeof child.value === 'string') return child.value;
          if (isHastElement(child) && !shouldSkip(child)) return collectText(child);
          return '';
        })
        .join('');

    const collectAnimatedText = (node: HastNode): string => {
      if (!isHastElement(node) || shouldSkip(node)) return '';
      if (STREAM_ANIMATED_BLOCK_TAGS.has(node.tagName)) return collectText(node);
      return node.children.map(collectAnimatedText).join('');
    };

    if (runtime) {
      syncVisibleTextTimeline({
        fadeDuration,
        now,
        runtime,
        visibleText: tree.children?.map(collectAnimatedText).join('') ?? ''
      });
    }

    const resolveStyle = (index: number): string | null => {
      if (!runtime) return null;

      const cachedStyle = runtime.styles[index];
      const birthTime = runtime.births[index];
      if (birthTime !== undefined && now - birthTime >= fadeDuration) {
        runtime.styles[index] = null;
        return null;
      }
      if (cachedStyle !== undefined) return cachedStyle;

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
