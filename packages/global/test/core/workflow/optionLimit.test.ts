import { describe, expect, it } from 'vitest';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import {
  MAX_SELECT_OPTION_COUNT,
  MAX_SELECT_OPTION_LENGTH,
  normalizeSelectOptionList,
  normalizeSelectValue,
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

  it('normalizes option items and caps option lists at 200 items', () => {
    const [item] = normalizeSelectOptionList([
      {
        value: 'v'.repeat(120)
      }
    ]);
    expect(item).toEqual({
      value: 'v'.repeat(100),
      label: 'v'.repeat(100)
    });

    const list = Array.from({ length: 220 }, (_, index) => ({
      value: `${index}_${'x'.repeat(110)}`,
      label: `${index}_${'y'.repeat(110)}`
    }));
    const normalized = normalizeSelectOptionList(list);
    expect(normalized).toHaveLength(MAX_SELECT_OPTION_COUNT);
    expect(normalized[0].value).toHaveLength(MAX_SELECT_OPTION_LENGTH);
    expect(normalized[0].label).toHaveLength(MAX_SELECT_OPTION_LENGTH);
  });

  it('normalizes single and multiple select values and leaves non-select types untouched', () => {
    expect(
      normalizeSelectValue({
        value: 's'.repeat(130),
        type: VariableInputEnum.select
      })
    ).toBe('s'.repeat(100));

    const multiValues = Array.from({ length: 215 }, (_, index) => `${index}_${'m'.repeat(120)}`);
    const normalizedMulti = normalizeSelectValue({
      value: multiValues,
      type: VariableInputEnum.multipleSelect
    }) as string[];
    expect(normalizedMulti).toHaveLength(MAX_SELECT_OPTION_COUNT);
    expect(normalizedMulti[0]).toHaveLength(MAX_SELECT_OPTION_LENGTH);

    const untouched = 't'.repeat(150);
    expect(
      normalizeSelectValue({
        value: untouched,
        type: VariableInputEnum.input
      })
    ).toBe(untouched);
  });
});
