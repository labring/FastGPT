export type CompletionContext = {
  /** 引导补全上下文的起始位置。 */
  anchor: number;
  /** 起始位置到当前光标之间用于查询引导词的文本。 */
  userQuery: string;
};

/** 生成从完整查询到末段的后缀搜索词，优先保留更多上下文。 */
export const getCompletionSearchKeys = (query: string) => {
  const keys: string[] = [];
  let key = query.trim();

  while (key) {
    keys.push(key);
    const nextKey = key.slice(1).trimStart();
    if (nextKey === key) break;
    key = nextKey;
  }

  return keys;
};

/** 判断返回的检索词是否仍属于当前查询的后缀。 */
export const isCompletionResultCurrent = ({
  text,
  searchKey
}: {
  text: string;
  searchKey: string;
}) => getCompletionSearchKeys(text).includes(searchKey);

type CompletionKeyAction = 'previous' | 'next' | 'close' | 'accept';

/**
 * 将补全面板内的按键映射为候选项导航、关闭或接受动作。
 * 空候选和带修饰键的接受按键保留原生输入行为。
 */
export const getCompletionKeyAction = ({
  key,
  hasContext,
  hasOptions,
  shiftKey,
  ctrlKey,
  altKey
}: {
  key: string;
  hasContext: boolean;
  hasOptions: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): CompletionKeyAction | undefined => {
  if (!hasContext) return;
  if (key === 'Escape') return 'close';
  if (!hasOptions) return;
  if (key === 'ArrowUp') return 'previous';
  if (key === 'ArrowDown') return 'next';
  if ((key === 'Enter' || key === 'Tab') && !shiftKey && !ctrlKey && !altKey) {
    return 'accept';
  }
};

/** 循环切换候选项，保证首尾连续。 */
export const getNextCompletionIndex = ({
  index,
  length,
  direction
}: {
  index: number;
  length: number;
  direction: -1 | 1;
}) => (length === 0 ? index : (index + direction + length) % length);

/** 在当前 context 的光标前区间内定位补全匹配词。 */
const getCompletionMatchIndex = ({
  context,
  value,
  cursor,
  matchText
}: {
  context: CompletionContext;
  value: string;
  cursor: number;
  matchText: string;
}) => {
  if (matchText.length === 0) return;

  const query = value.slice(context.anchor, cursor);
  const matchIndex = query.lastIndexOf(matchText);

  return matchIndex < 0 ? undefined : context.anchor + matchIndex;
};

/** 程序回填后旧 context 不再对应当前文本。 */
export const isCompletionContextCurrent = ({
  context,
  value,
  cursor,
  matchText
}: {
  context: CompletionContext;
  value: string;
  cursor?: number;
  matchText?: string;
}) => {
  const resolvedCursor = cursor ?? context.anchor + context.userQuery.length;
  if (value.slice(context.anchor, resolvedCursor) !== context.userQuery) return false;
  if (matchText === undefined) return true;

  return (
    getCompletionMatchIndex({
      context,
      value,
      cursor: resolvedCursor,
      matchText
    }) !== undefined
  );
};

/**
 * 根据光标位置刷新引导补全上下文。
 * 光标回到 anchor 或 anchor 之前时返回 undefined，表示关闭补全。
 */
export const getCompletionContext = ({
  anchor,
  value,
  cursor
}: {
  anchor: number;
  value: string;
  cursor: number;
}): CompletionContext | undefined => {
  if (cursor <= anchor) return;

  return {
    anchor,
    userQuery: value.slice(anchor, cursor)
  };
};

/** 找到一次文本变更的起始 UTF-16 索引，用于在空上下文中建立 anchor。 */
export const getChangedTextStart = (before: string, after: string) => {
  const maxLength = Math.min(before.length, after.length);
  let index = 0;

  while (index < maxLength && before[index] === after[index]) {
    index += 1;
  }

  return index;
};

/**
 * 根据一次文本编辑刷新补全上下文。
 * 已有上下文且光标仍位于 anchor 之后时沿用 anchor，否则在新输入点建立 anchor。
 */
export const getEditedCompletionContext = ({
  context,
  before,
  after,
  cursor,
  isInsertion
}: {
  context?: CompletionContext;
  before: string;
  after: string;
  cursor: number;
  isInsertion: boolean;
}): CompletionContext | undefined => {
  if (context) {
    // 修改 anchor 前的文本会让原起点失效，关闭后由下一次输入重新建立上下文。
    if (getChangedTextStart(before, after) < context.anchor) return;

    return getCompletionContext({ anchor: context.anchor, value: after, cursor });
  }

  if (!isInsertion) return;

  return getCompletionContext({
    anchor: getChangedTextStart(before, after),
    value: after,
    cursor
  });
};

/** 返回在光标处插入换行后的文本和下一帧光标位置。 */
export const insertNewline = ({ value, cursor }: { value: string; cursor: number }) => ({
  value: `${value.slice(0, cursor)}\n${value.slice(cursor)}`,
  cursor: cursor + 1
});

/** 用选中的引导词替换命中的查询后缀，保留已经输入的前缀。 */
export const applyInputGuide = ({
  context,
  value,
  cursor,
  guide,
  matchText
}: {
  context: CompletionContext;
  value: string;
  cursor: number;
  guide: string;
  matchText: string;
}) => {
  const replaceStart =
    getCompletionMatchIndex({ context, value, cursor, matchText }) ?? context.anchor;
  const prefix = value.slice(0, replaceStart);
  const suffix = value.slice(cursor);
  const nextValue = `${prefix}${guide}${suffix}`;

  return {
    value: nextValue,
    cursor: prefix.length + guide.length
  };
};
