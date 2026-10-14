import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_HISTORY_SELECTOR,
  getWorkflowHistoryShortcut,
  isExternalHistoryTarget,
  isWorkflowShortcutInputtingTarget
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/keyboard';

const createElementMock = ({
  closestMap = {},
  className = ''
}: {
  closestMap?: Record<string, unknown>;
  className?: string;
}) => {
  const element = {
    nodeType: 1,
    className,
    closest: vi.fn((selector: string) => closestMap[selector] ?? null),
    getAttribute: vi.fn((attr: string) => {
      if (attr !== 'contenteditable') return null;
      return 'true';
    })
  };

  return element;
};

describe('isWorkflowShortcutInputtingTarget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should treat native form input targets as inputting', () => {
    const input = createElementMock({
      closestMap: {
        'input, textarea, select': true
      }
    });

    expect(isWorkflowShortcutInputtingTarget(input as unknown as EventTarget)).toBe(true);
  });

  it('should treat Lexical contenteditable selection as inputting', () => {
    const editor = createElementMock({
      closestMap: {
        '[contenteditable]': {
          getAttribute: () => 'true'
        }
      }
    });

    vi.stubGlobal('window', {
      getSelection: () => ({
        rangeCount: 1,
        isCollapsed: false,
        anchorNode: {
          parentElement: editor
        },
        focusNode: {
          parentElement: editor
        }
      })
    });

    expect(isWorkflowShortcutInputtingTarget(undefined)).toBe(true);
  });

  it('should ignore collapsed selections outside editable targets', () => {
    vi.stubGlobal('window', {
      getSelection: () => ({
        rangeCount: 1,
        isCollapsed: true,
        anchorNode: null,
        focusNode: null
      })
    });

    expect(isWorkflowShortcutInputtingTarget(undefined)).toBe(false);
  });

  it('should not treat canvas targets as inputting', () => {
    const canvas = createElementMock({});

    expect(isWorkflowShortcutInputtingTarget(canvas as unknown as EventTarget)).toBe(false);
  });
});

describe('getWorkflowHistoryShortcut', () => {
  const shortcut = (
    key: string,
    modifiers: Partial<Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>> = {}
  ) =>
    getWorkflowHistoryShortcut({
      key,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      ...modifiers
    });

  it('maps ctrl/cmd+z to undo and shift or y variants to redo', () => {
    expect(shortcut('z', { ctrlKey: true })).toBe('undo');
    expect(shortcut('Z', { metaKey: true })).toBe('undo');
    expect(shortcut('z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(shortcut('z', { metaKey: true, shiftKey: true })).toBe('redo');
    expect(shortcut('y', { ctrlKey: true })).toBe('redo');
    expect(shortcut('y', { metaKey: true })).toBe('redo');
  });

  it('leaves other combinations to the browser or the focused input', () => {
    expect(shortcut('z')).toBeUndefined();
    expect(shortcut('y')).toBeUndefined();
    expect(shortcut('x', { ctrlKey: true })).toBeUndefined();
    expect(shortcut('y', { ctrlKey: true, shiftKey: true })).toBeUndefined();
    expect(shortcut('z', { ctrlKey: true, altKey: true })).toBeUndefined();
  });
});

describe('isExternalHistoryTarget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches targets inside a runtime-owned field', () => {
    const target = createElementMock({
      closestMap: { [EXTERNAL_HISTORY_SELECTOR]: {} }
    });

    expect(isExternalHistoryTarget(target as unknown as EventTarget)).toBe(true);
  });

  it('ignores editors that keep their own undo stack', () => {
    vi.stubGlobal('document', { activeElement: null });
    const target = createElementMock({});

    expect(isExternalHistoryTarget(target as unknown as EventTarget)).toBe(false);
  });
});
