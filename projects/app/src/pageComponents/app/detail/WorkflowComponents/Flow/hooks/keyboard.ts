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
