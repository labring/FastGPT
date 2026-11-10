export type CompletionContext = {
  /** 引导补全上下文的起始位置。 */
  anchor: number;
  /** 起始位置到当前光标之间用于查询引导词的文本。 */
  userQuery: string;
};

/** 将补全面板内的按键映射为候选项导航或关闭动作。 */
export const getCompletionKeyAction = ({
  key,
  hasContext,
  canAccept
}: {
  key: string;
  hasContext: boolean;
  canAccept: boolean;
}) => {
  if (!hasContext) return;
  if (key === 'ArrowUp') return 'previous';
  if (key === 'ArrowDown') return 'next';
  if (key === 'Escape') return 'close';
  if (canAccept && (key === 'Enter' || key === 'Tab')) return 'accept';
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
}) => (index + direction + length) % length;

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

/** 用选中的引导词替换 userQuery，并返回补全后的文本和光标位置。 */
export const applyInputGuide = ({
  context,
  value,
  cursor,
  guide
}: {
  context: CompletionContext;
  value: string;
  cursor: number;
  guide: string;
}) => {
  const prefix = value.slice(0, context.anchor);
  const suffix = value.slice(Math.max(cursor, context.anchor));
  const nextValue = `${prefix}${guide}${suffix}`;

  return {
    value: nextValue,
    cursor: prefix.length + guide.length
  };
};
