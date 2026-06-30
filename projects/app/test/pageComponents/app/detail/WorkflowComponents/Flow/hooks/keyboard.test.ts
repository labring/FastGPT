import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWorkflowShortcutInputtingTarget } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/keyboard';

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
