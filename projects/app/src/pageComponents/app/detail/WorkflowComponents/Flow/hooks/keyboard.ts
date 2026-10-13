const formInputSelector = 'input, textarea, select';
const contentEditableSelector = '[contenteditable]';

const getElementFromNode = (target?: EventTarget | Node | null): Element | null => {
  if (!target) return null;

  const node = target as Node & {
    nodeType?: number;
    parentElement?: Element | null;
  };

  if (node.nodeType === 1) {
    return node as unknown as Element;
  }

  return node.parentElement ?? null;
};

const getClassName = (element: Element) => {
  const className = (element as { className?: unknown }).className;
  if (typeof className === 'string') return className.toLowerCase();
  if (
    className &&
    typeof className === 'object' &&
    typeof (className as { baseVal?: unknown }).baseVal === 'string'
  ) {
    return (className as { baseVal: string }).baseVal.toLowerCase();
  }

  return '';
};

const isEditableElement = (target?: EventTarget | Node | null) => {
  const element = getElementFromNode(target);
  if (!element) return false;

  if (element.closest(formInputSelector)) return true;

  const contentEditableElement = element.closest(contentEditableSelector);
  if (contentEditableElement) {
    const editableValue = contentEditableElement.getAttribute('contenteditable');
    if (editableValue !== 'false') return true;
  }

  const className = getClassName(element);
  return className.includes('prompteditor') || className.includes('contenteditable');
};

/**
 * 判断工作流画布快捷键是否应让文本编辑区优先处理。
 * ahooks 的全局 keydown 回调在 Lexical/contenteditable 选区场景下可能拿到 body 作为
 * target，因此需要同时检查事件目标、当前焦点和 Selection 锚点。
 */
export const isWorkflowShortcutInputtingTarget = (target?: EventTarget | Node | null) => {
  if (isEditableElement(target)) return true;

  if (typeof document !== 'undefined' && isEditableElement(document.activeElement)) return true;

  const selection =
    typeof window !== 'undefined' && typeof window.getSelection === 'function'
      ? window.getSelection()
      : null;
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

  return isEditableElement(selection.anchorNode) || isEditableElement(selection.focusNode);
};

/** 撤销重做快捷键只需要修饰键与主键，不依赖完整 KeyboardEvent，便于单测。 */
export type WorkflowHistoryShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'
>;

/**
 * 解析画布撤销重做快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 与 Ctrl+Y 重做。
 * 与旧 ahooks 组合键（ctrl.z / meta.z / ctrl.shift.z / meta.shift.z / ctrl.y / meta.y）等价，
 * 其余组合（含 Alt 组合与 Ctrl+Shift+Y）一律不接管，交回浏览器或输入控件。
 */
export const getWorkflowHistoryShortcut = (
  event: WorkflowHistoryShortcutEvent
): 'undo' | 'redo' | undefined => {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return undefined;

  const key = event.key.toLowerCase();
  if (key === 'y') return event.shiftKey ? undefined : 'redo';
  if (key !== 'z') return undefined;
  return event.shiftKey ? 'redo' : 'undo';
};

/**
 * 由 Runtime 托管撤销的字段标记：这些字段不维护自己的撤销栈（Lexical 本地历史按秒合并输入，
 * 会与逐条记录的 Runtime 历史打架），撤销重做快捷键必须交给画布统一处理。
 */
export const EXTERNAL_HISTORY_SELECTOR = '[data-workflow-history="external"]';

/**
 * 判断快捷键目标是否落在 Runtime 托管字段内。
 * 与 isWorkflowShortcutInputtingTarget 一样兜底 activeElement：Lexical 选区场景下，
 * 全局 keydown 回调可能拿到 body 作为 target。
 */
export const isExternalHistoryTarget = (target?: EventTarget | Node | null) => {
  if (getElementFromNode(target)?.closest(EXTERNAL_HISTORY_SELECTOR)) return true;
  if (typeof document === 'undefined') return false;
  return !!getElementFromNode(document.activeElement)?.closest(EXTERNAL_HISTORY_SELECTOR);
};
