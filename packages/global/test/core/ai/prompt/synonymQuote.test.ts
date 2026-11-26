import { describe, expect, it } from 'vitest';
import {
  Prompt_QuoteTemplateList,
  Prompt_systemQuotePromptList,
  Prompt_userQuotePromptList
} from '@fastgpt/global/core/ai/prompt/AIChat';
import { withSynonymQuoteTemplates } from '@fastgpt/global/core/ai/prompt/synonymQuote';

/** 模板只有一个版本时，直接取该版本文本，测试只关心拼接结果。 */
const getValue = (list: ReturnType<typeof withSynonymQuoteTemplates>, index = 0) =>
  Object.values(list[index].value)[0] as string;

describe('withSynonymQuoteTemplates', () => {
  it('returns the original templates untouched when disabled', () => {
    const result = withSynonymQuoteTemplates(Prompt_userQuotePromptList, { enabled: false });
    expect(result[0].value).toEqual(Prompt_userQuotePromptList[0].value);
  });

  it('injects synonymMappings into content templates by shape', () => {
    const result = withSynonymQuoteTemplates(Prompt_QuoteTemplateList, {
      enabled: true,
      content: true
    });

    // JSON 形态：占位符作为新字段插在结尾右括号之前，保持合法 JSON。
    const jsonText = getValue(result, 0);
    expect(jsonText).toContain('"synonymMappings": {{synonymMappings}}');
    expect(jsonText.trimEnd().endsWith('}')).toBe(true);

    // <Question> 形态：追加独立的 <SynonymMappings> 块。
    const questionText = getValue(result, 1);
    expect(questionText).toContain('<SynonymMappings>\n{{synonymMappings}}\n</SynonymMappings>');
  });

  it('inserts the explanation before the trailing "## 回答" heading of user role templates', () => {
    const result = withSynonymQuoteTemplates(Prompt_userQuotePromptList, {
      enabled: true,
      content: false
    });
    const text = getValue(result);

    // 说明必须在回答标题之前，且回答标题仍是最后一段：追加到标题之后会落进回答区。
    expect(text.indexOf('## 词汇映射说明')).toBeGreaterThan(-1);
    expect(text.indexOf('## 词汇映射说明')).toBeLessThan(text.lastIndexOf('## 回答'));
    expect(text.trimEnd().endsWith('## 回答')).toBe(true);
  });

  it('appends the explanation at the end when the template has no trailing heading', () => {
    const result = withSynonymQuoteTemplates(
      [
        {
          title: 'custom',
          desc: '',
          value: { '1.0': '按如下资料回答：{{quote}}' }
        }
      ],
      { enabled: true, content: false }
    );
    const text = getValue(result);

    expect(text.startsWith('按如下资料回答：{{quote}}')).toBe(true);
    expect(text.trimEnd().endsWith('不要为映射本身生成引用标记。')).toBe(true);
  });

  it('uses the English explanation for English prompts', () => {
    const result = withSynonymQuoteTemplates(Prompt_systemQuotePromptList, {
      enabled: true,
      content: false,
      english: true
    });
    const text = getValue(result);

    expect(text).toContain('## Vocabulary Mapping');
    expect(text).not.toContain('## 词汇映射说明');
  });
});
