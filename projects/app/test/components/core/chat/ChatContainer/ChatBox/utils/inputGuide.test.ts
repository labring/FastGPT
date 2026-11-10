import { describe, expect, it } from 'vitest';
import {
  applyInputGuide,
  getCompletionKeyAction,
  getChangedTextStart,
  getCompletionContext,
  getCompletionSearchKeys,
  getEditedCompletionContext,
  getNextCompletionIndex,
  insertNewline,
  isCompletionContextCurrent
} from '@/components/core/chat/ChatContainer/ChatBox/utils/inputGuide';

describe('input guide completion context', () => {
  it('creates a context from the input position and current caret', () => {
    expect(
      getCompletionContext({
        anchor: 3,
        value: '请介绍FastG',
        cursor: 8
      })
    ).toEqual({
      anchor: 3,
      userQuery: 'FastG'
    });
  });

  it('tries full query before shorter non-whitespace suffixes', () => {
    expect(getCompletionSearchKeys('FastGPT 是什么， ')).toEqual([
      'FastGPT 是什么，',
      'astGPT 是什么，',
      'stGPT 是什么，',
      'tGPT 是什么，',
      'GPT 是什么，',
      'PT 是什么，',
      'T 是什么，',
      '是什么，',
      '什么，',
      '么，',
      '，'
    ]);
  });

  it('supports a query that starts as a suffix after an accepted guide', () => {
    expect(getCompletionSearchKeys('FastGPT 是什么？ ')).toEqual([
      'FastGPT 是什么？',
      'astGPT 是什么？',
      'stGPT 是什么？',
      'tGPT 是什么？',
      'GPT 是什么？',
      'PT 是什么？',
      'T 是什么？',
      '是什么？',
      '什么？',
      '么？',
      '？'
    ]);
  });

  it('updates the query when the caret moves after the anchor', () => {
    expect(
      getCompletionContext({
        anchor: 3,
        value: '请介绍FastGPT',
        cursor: 6
      })
    ).toEqual({
      anchor: 3,
      userQuery: 'Fas'
    });
  });

  it('resets at or before the anchor', () => {
    expect(getCompletionContext({ anchor: 2, value: '请介绍', cursor: 2 })).toBeUndefined();
    expect(getCompletionContext({ anchor: 2, value: '请介绍', cursor: 1 })).toBeUndefined();
  });

  it('finds the insertion start in the middle of existing text', () => {
    expect(getChangedTextStart('请介绍世界', '请介绍FastGPT世界')).toBe(3);
  });

  it('creates a context from a typed insertion and keeps it while appending', () => {
    const context = getEditedCompletionContext({
      before: '请介绍',
      after: '请介绍F',
      cursor: 4,
      isInsertion: true
    });
    expect(context).toEqual({ anchor: 3, userQuery: 'F' });
    expect(
      getEditedCompletionContext({
        context,
        before: '请介绍F',
        after: '请介绍Fa',
        cursor: 5,
        isInsertion: true
      })
    ).toEqual({ anchor: 3, userQuery: 'Fa' });
  });

  it('closes the context when an edit changes text before the anchor', () => {
    expect(
      getEditedCompletionContext({
        context: { anchor: 3, userQuery: 'FastG' },
        before: '请介绍FastG',
        after: '请讲FastG',
        cursor: 5,
        isInsertion: true
      })
    ).toBeUndefined();
  });

  it('inserts a newline at the current caret', () => {
    expect(
      insertNewline({
        value: '请介绍FastG',
        cursor: 8
      })
    ).toEqual({
      value: '请介绍FastG\n',
      cursor: 9
    });
  });

  it('maps completion keys only while options are available', () => {
    const base = {
      hasContext: true,
      hasOptions: true,
      shiftKey: false,
      ctrlKey: false,
      altKey: false
    };
    expect(getCompletionKeyAction({ ...base, key: 'ArrowUp' })).toBe('previous');
    expect(getCompletionKeyAction({ ...base, key: 'ArrowDown' })).toBe('next');
    expect(getCompletionKeyAction({ ...base, key: 'Escape', hasOptions: false })).toBe('close');
    expect(getCompletionKeyAction({ ...base, key: 'Enter' })).toBe('accept');
    expect(getCompletionKeyAction({ ...base, key: 'Tab' })).toBe('accept');
    expect(getCompletionKeyAction({ ...base, key: 'ArrowUp', hasOptions: false })).toBeUndefined();
    expect(
      getCompletionKeyAction({ ...base, key: 'ArrowDown', hasOptions: false })
    ).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'Enter', hasOptions: false })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'Tab', hasOptions: false })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'ArrowLeft' })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'ArrowRight' })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'Enter', ctrlKey: true })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'Enter', altKey: true })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'Enter', shiftKey: true })).toBeUndefined();
    expect(getCompletionKeyAction({ ...base, key: 'Escape', hasContext: false })).toBeUndefined();
  });

  it('cycles completion options in both directions', () => {
    expect(getNextCompletionIndex({ index: 0, length: 3, direction: 1 })).toBe(1);
    expect(getNextCompletionIndex({ index: 2, length: 3, direction: 1 })).toBe(0);
    expect(getNextCompletionIndex({ index: 0, length: 3, direction: -1 })).toBe(2);
    expect(getNextCompletionIndex({ index: 0, length: 0, direction: 1 })).toBe(0);
  });

  it('rejects a context after the form value is filled externally', () => {
    const context = { anchor: 0, userQuery: 'FastG' };
    expect(isCompletionContextCurrent({ context, value: 'FastGPT' })).toBe(true);
    expect(isCompletionContextCurrent({ context, value: '请帮我写周报' })).toBe(false);
  });

  it('replaces only the queried range and keeps surrounding text', () => {
    expect(
      applyInputGuide({
        context: { anchor: 3, userQuery: 'FastG' },
        value: '请介绍FastGPT世界',
        cursor: 8,
        guide: 'FastGPT 是什么？',
        matchText: 'FastG'
      })
    ).toEqual({
      value: '请介绍FastGPT 是什么？PT世界',
      cursor: 15
    });
  });

  it('replaces only the matched suffix and preserves the entered prefix', () => {
    const value = 'FastGPT 是什么？，';
    expect(
      applyInputGuide({
        context: { anchor: 0, userQuery: value },
        value,
        cursor: value.length,
        guide: '还能做什么？',
        matchText: '是什么？，'
      })
    ).toEqual({
      value: 'FastGPT 还能做什么？',
      cursor: 14
    });
  });

  it('replaces the matched suffix when a trailing space follows it', () => {
    const value = 'FastGPT 是什么？ ';
    expect(
      applyInputGuide({
        context: { anchor: 0, userQuery: value },
        value,
        cursor: value.length,
        guide: '还能做什么？',
        matchText: '是什么？'
      })
    ).toEqual({
      value: 'FastGPT 还能做什么？',
      cursor: 14
    });
  });
});
