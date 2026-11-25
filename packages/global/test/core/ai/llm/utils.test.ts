import { describe, expect, it } from 'vitest';
import { REASONING_EFFORT_LEVELS } from '@fastgpt/global/core/ai/constants';
import {
  getLLMSupportParams,
  getLowestReasoningEffort,
  getSupportedReasoningEfforts,
  normalizeReasoningEffortList,
  removeDatasetCiteText
} from '@fastgpt/global/core/ai/llm/utils';

describe('removeDatasetCiteText', () => {
  describe('when retainDatasetCite is true', () => {
    it('should only remove [id](CITE) pattern', () => {
      const text = 'Hello [id](CITE) world';
      expect(removeDatasetCiteText(text, true)).toBe('Hello  world');
    });

    it('should only remove 【id】(CITE) pattern', () => {
      const text = 'Hello 【id】(CITE) world';
      expect(removeDatasetCiteText(text, true)).toBe('Hello  world');
    });

    it('should keep 24-char hex id patterns when retainDatasetCite is true', () => {
      const text = 'Reference [507f1f77bcf86cd799439011] here';
      expect(removeDatasetCiteText(text, true)).toBe('Reference [507f1f77bcf86cd799439011] here');
    });

    it('should keep 24-char hex id with parentheses when retainDatasetCite is true', () => {
      const text = 'Reference [507f1f77bcf86cd799439011](link) here';
      expect(removeDatasetCiteText(text, true)).toBe(
        'Reference [507f1f77bcf86cd799439011](link) here'
      );
    });

    it('should remove multiple [id](CITE) patterns', () => {
      const text = '[id](CITE) start [id](CITE) middle 【id】(CITE) end';
      expect(removeDatasetCiteText(text, true)).toBe(' start  middle  end');
    });
  });

  describe('when retainDatasetCite is false', () => {
    it('should remove [id](CITE) pattern', () => {
      const text = 'Hello [id](CITE) world';
      expect(removeDatasetCiteText(text, false)).toBe('Hello  world');
    });

    it('should remove 24-char hex id in square brackets', () => {
      const text = 'Reference [507f1f77bcf86cd799439011] here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove 24-char hex id in Chinese brackets', () => {
      const text = 'Reference 【507f1f77bcf86cd799439011】 here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove 24-char hex id with parentheses content', () => {
      const text = 'Reference [507f1f77bcf86cd799439011](some link) here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove 24-char hex id with Chinese brackets and parentheses', () => {
      const text = 'Reference 【507f1f77bcf86cd799439011】(some link) here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove multiple citation patterns', () => {
      const text = '[507f1f77bcf86cd799439011] and [607f1f77bcf86cd799439012](link) and [id](CITE)';
      expect(removeDatasetCiteText(text, false)).toBe(' and  and ');
    });

    it('should handle mixed bracket styles', () => {
      const text = '[507f1f77bcf86cd799439011] and 【607f1f77bcf86cd799439012】';
      expect(removeDatasetCiteText(text, false)).toBe(' and ');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(removeDatasetCiteText('', true)).toBe('');
      expect(removeDatasetCiteText('', false)).toBe('');
    });

    it('should return original text when no patterns match', () => {
      const text = 'Hello world without citations';
      expect(removeDatasetCiteText(text, true)).toBe(text);
      expect(removeDatasetCiteText(text, false)).toBe(text);
    });

    it('should not remove non-24-char hex ids', () => {
      const text = '[abc123] and [507f1f77bcf86cd79943901] short';
      expect(removeDatasetCiteText(text, false)).toBe(
        '[abc123] and [507f1f77bcf86cd79943901] short'
      );
    });

    it('should not remove ids with non-hex characters', () => {
      const text = '[507f1f77bcf86cd79943901g] invalid';
      expect(removeDatasetCiteText(text, false)).toBe('[507f1f77bcf86cd79943901g] invalid');
    });
  });
});

describe('reasoning effort level helpers', () => {
  it('normalizes, deduplicates and sorts reasoning effort levels in canonical order', () => {
    expect(normalizeReasoningEffortList(['high', 'none', 'high', 'low', 'invalid'])).toEqual([
      'none',
      'low',
      'high'
    ]);
    expect(normalizeReasoningEffortList([])).toEqual([]);
    expect(normalizeReasoningEffortList(undefined)).toEqual([]);
  });

  it('resolves supported reasoning efforts with legacy compatibility and explicit overrides', () => {
    const baseConfig = {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 64000
    };

    // 历史数据：仅开启 reasoningEffort 时回退为全部 6 个等级
    expect(
      getSupportedReasoningEfforts({
        config: { ...baseConfig, reasoning: true, reasoningEffort: true }
      })
    ).toEqual([...REASONING_EFFORT_LEVELS]);

    // 显式配置了等级列表时按列表返回
    expect(
      getSupportedReasoningEfforts({
        config: {
          ...baseConfig,
          reasoning: true,
          reasoningEffort: true,
          reasoningEffortList: ['high', 'low']
        }
      })
    ).toEqual(['low', 'high']);

    // 显式空数组、未开启/关闭 reasoning 或关闭 reasoningEffort 均返回空
    expect(
      getSupportedReasoningEfforts({
        config: {
          ...baseConfig,
          reasoning: true,
          reasoningEffort: true,
          reasoningEffortList: []
        }
      })
    ).toEqual([]);
    expect(
      getSupportedReasoningEfforts({
        config: {
          ...baseConfig,
          reasoning: false,
          reasoningEffort: true,
          reasoningEffortList: ['low', 'high']
        }
      })
    ).toEqual([]);
    expect(
      getSupportedReasoningEfforts({
        config: {
          ...baseConfig,
          reasoningEffort: true,
          reasoningEffortList: ['low', 'high']
        }
      })
    ).toEqual([]);
    expect(
      getSupportedReasoningEfforts({
        config: {
          ...baseConfig,
          reasoning: true,
          reasoningEffort: false,
          reasoningEffortList: ['low', 'high']
        }
      })
    ).toEqual([]);
    expect(getSupportedReasoningEfforts(undefined)).toEqual([]);
  });

  it('exposes reasoningEffort boolean and reasoningEffortList from getLLMSupportParams', () => {
    const withList = getLLMSupportParams({
      config: {
        maxContext: 128000,
        maxResponse: 4096,
        quoteMaxToken: 64000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['none', 'high']
      }
    });
    expect(withList.reasoningEffort).toBe(true);
    expect(withList.reasoningEffortList).toEqual(['none', 'high']);

    const withEmptyList = getLLMSupportParams({
      config: {
        maxContext: 128000,
        maxResponse: 4096,
        quoteMaxToken: 64000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: []
      }
    });
    expect(withEmptyList.reasoningEffort).toBe(false);
    expect(withEmptyList.reasoningEffortList).toEqual([]);
  });

  it('picks the lowest supported reasoning effort and returns undefined when unsupported', () => {
    const baseConfig = {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 64000
    };

    expect(
      getLowestReasoningEffort({
        config: { ...baseConfig, reasoning: true, reasoningEffort: true }
      })
    ).toBe('none');
    expect(
      getLowestReasoningEffort({
        config: {
          ...baseConfig,
          reasoning: true,
          reasoningEffort: true,
          reasoningEffortList: ['high', 'minimal', 'low']
        }
      })
    ).toBe('minimal');
    expect(
      getLowestReasoningEffort({
        config: {
          ...baseConfig,
          reasoning: true,
          reasoningEffort: true,
          reasoningEffortList: ['high', 'low']
        }
      })
    ).toBe('low');
    expect(
      getLowestReasoningEffort({
        config: { ...baseConfig, reasoning: true, reasoningEffort: false }
      })
    ).toBeUndefined();
    expect(
      getLowestReasoningEffort({
        config: { ...baseConfig, reasoning: false, reasoningEffort: true }
      })
    ).toBeUndefined();
    expect(
      getLowestReasoningEffort({
        config: {
          ...baseConfig,
          reasoning: true,
          reasoningEffort: true,
          reasoningEffortList: []
        }
      })
    ).toBeUndefined();
    expect(getLowestReasoningEffort(undefined)).toBeUndefined();
  });
});
