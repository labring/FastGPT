import { describe, expect, it } from 'vitest';
import {
  MAX_SELECT_OPTION_LENGTH,
  truncateSelectOptionText
} from '@fastgpt/global/core/workflow/optionLimit';

describe('optionLimit utilities', () => {
  it('truncates option text to 100 chars without splitting surrogate pairs', () => {
    const shortText = 'a'.repeat(MAX_SELECT_OPTION_LENGTH);
    const longText = 'b'.repeat(MAX_SELECT_OPTION_LENGTH + 25);
    expect(truncateSelectOptionText(shortText)).toBe(shortText);
    expect(truncateSelectOptionText(longText)).toBe('b'.repeat(MAX_SELECT_OPTION_LENGTH));

    // 第 100 个码元恰好是 Emoji 高代理项时，回退 1 位避免产生孤立代理项
    const boundaryEmoji = `${'a'.repeat(MAX_SELECT_OPTION_LENGTH - 1)}😀`;
    expect(boundaryEmoji.length).toBe(MAX_SELECT_OPTION_LENGTH + 1);
    expect(truncateSelectOptionText(boundaryEmoji)).toBe('a'.repeat(MAX_SELECT_OPTION_LENGTH - 1));
  });
});
