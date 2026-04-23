import { describe, expect, it } from 'vitest';
import {
  Prompt_userQuotePromptList,
  Prompt_systemQuotePromptList,
  Prompt_QuoteTemplateList,
  getQuoteTemplate,
  getQuotePrompt,
  getDocumentQuotePrompt
} from '@fastgpt/global/core/ai/prompt/AIChat';

/**
 * Note: The source file has `/* v8 ignore file *\/` which excludes it from
 * v8 coverage instrumentation. Tests are still valuable for correctness
 * verification even though coverage metrics won't be reported for this file.
 *
 * i18nT is a pass-through function (key => key), so no mocking is needed.
 * getPromptByVersion is tested separately in utils.test.ts; here we verify
 * integration behavior through the exported wrapper functions.
 */

// ---------------------------------------------------------------------------
// Helper: validate the shape of every item in a PromptTemplateItem[]
// ---------------------------------------------------------------------------
function assertPromptTemplateList(
  list: Array<{ title: string; desc: string; value: Record<string, string> }>,
  expectedLength: number
) {
  expect(list).toHaveLength(expectedLength);
  list.forEach((item) => {
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('desc');
    expect(item).toHaveProperty('value');
    expect(typeof item.title).toBe('string');
    expect(typeof item.desc).toBe('string');
    expect(typeof item.value).toBe('object');
    // value must have at least one version key
    const versionKeys = Object.keys(item.value);
    expect(versionKeys.length).toBeGreaterThanOrEqual(1);
    // Every version value must be a non-empty string
    versionKeys.forEach((ver) => {
      expect(typeof item.value[ver]).toBe('string');
      expect(item.value[ver].length).toBeGreaterThan(0);
    });
  });
}

// ===========================================================================
// 1. Prompt_userQuotePromptList
// ===========================================================================
describe('Prompt_userQuotePromptList', () => {
  it('should contain exactly 4 items with correct structure', () => {
    assertPromptTemplateList(Prompt_userQuotePromptList, 4);
  });

  it('should have i18nT keys as titles (pass-through)', () => {
    expect(Prompt_userQuotePromptList[0].title).toBe('app:template.standard_template');
    expect(Prompt_userQuotePromptList[1].title).toBe('app:template.qa_template');
    expect(Prompt_userQuotePromptList[2].title).toBe('app:template.standard_strict');
    expect(Prompt_userQuotePromptList[3].title).toBe('app:template.hard_strict');
  });

  it('should have empty desc for all items', () => {
    Prompt_userQuotePromptList.forEach((item) => {
      expect(item.desc).toBe('');
    });
  });

  it('should contain {{quote}} placeholder in every version prompt', () => {
    Prompt_userQuotePromptList.forEach((item) => {
      Object.values(item.value).forEach((prompt) => {
        expect(prompt).toContain('{{quote}}');
      });
    });
  });

  it('should contain {{question}} placeholder in every version prompt', () => {
    Prompt_userQuotePromptList.forEach((item) => {
      Object.values(item.value).forEach((prompt) => {
        expect(prompt).toContain('{{question}}');
      });
    });
  });
});

// ===========================================================================
// 2. Prompt_systemQuotePromptList
// ===========================================================================
describe('Prompt_systemQuotePromptList', () => {
  it('should contain exactly 4 items with correct structure', () => {
    assertPromptTemplateList(Prompt_systemQuotePromptList, 4);
  });

  it('should have i18nT keys as titles (pass-through)', () => {
    expect(Prompt_systemQuotePromptList[0].title).toBe('app:template.standard_template');
    expect(Prompt_systemQuotePromptList[1].title).toBe('app:template.qa_template');
    expect(Prompt_systemQuotePromptList[2].title).toBe('app:template.standard_strict');
    expect(Prompt_systemQuotePromptList[3].title).toBe('app:template.hard_strict');
  });

  it('should have empty desc for all items', () => {
    Prompt_systemQuotePromptList.forEach((item) => {
      expect(item.desc).toBe('');
    });
  });

  it('should contain {{quote}} placeholder in every version prompt', () => {
    Prompt_systemQuotePromptList.forEach((item) => {
      Object.values(item.value).forEach((prompt) => {
        expect(prompt).toContain('{{quote}}');
      });
    });
  });

  it('should NOT contain {{question}} (system prompts omit user question)', () => {
    Prompt_systemQuotePromptList.forEach((item) => {
      Object.values(item.value).forEach((prompt) => {
        expect(prompt).not.toContain('{{question}}');
      });
    });
  });
});

// ===========================================================================
// 3. Prompt_QuoteTemplateList
// ===========================================================================
describe('Prompt_QuoteTemplateList', () => {
  it('should contain exactly 4 items with correct structure', () => {
    assertPromptTemplateList(Prompt_QuoteTemplateList, 4);
  });

  it('should have i18nT keys as titles (pass-through)', () => {
    expect(Prompt_QuoteTemplateList[0].title).toBe('app:template.standard_template');
    expect(Prompt_QuoteTemplateList[1].title).toBe('app:template.qa_template');
    expect(Prompt_QuoteTemplateList[2].title).toBe('app:template.standard_strict');
    expect(Prompt_QuoteTemplateList[3].title).toBe('app:template.hard_strict');
  });

  it('should have non-empty desc for all items (template descriptions)', () => {
    Prompt_QuoteTemplateList.forEach((item) => {
      expect(item.desc.length).toBeGreaterThan(0);
    });
  });

  it('should contain {{q}} and {{a}} placeholders in every version', () => {
    Prompt_QuoteTemplateList.forEach((item) => {
      Object.values(item.value).forEach((tpl) => {
        expect(tpl).toContain('{{q}}');
        expect(tpl).toContain('{{a}}');
      });
    });
  });
});

// ===========================================================================
// 4. getQuoteTemplate
// ===========================================================================
describe('getQuoteTemplate', () => {
  it('should return the highest version prompt when no version is provided', () => {
    const result = getQuoteTemplate();
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
    // The first item in Prompt_QuoteTemplateList is the default source
    const defaultValue = Prompt_QuoteTemplateList[0].value;
    const highestVersion = Object.keys(defaultValue).sort((a, b) => {
      const [ma, mia, pa] = a.split('.').map(Number);
      const [mb, mib, pb] = b.split('.').map(Number);
      if (ma !== mb) return mb - ma;
      if (mia !== mib) return mib - mia;
      return pb - pa;
    })[0];
    expect(result).toBe(defaultValue[highestVersion]);
  });

  it('should return the matching version when an existing version is provided', () => {
    const result = getQuoteTemplate('4.9.7');
    expect(result).toBe(Prompt_QuoteTemplateList[0].value['4.9.7']);
  });

  it('should fall back to highest version when a non-existing version is provided', () => {
    const result = getQuoteTemplate('99.99.99');
    // Falls back to highest version of the first template's value
    expect(result).toBe(getQuoteTemplate());
  });

  it('should return a string containing template placeholders', () => {
    const result = getQuoteTemplate('4.9.7');
    expect(result).toContain('{{q}}');
    expect(result).toContain('{{a}}');
  });
});

// ===========================================================================
// 5. getQuotePrompt
// ===========================================================================
describe('getQuotePrompt', () => {
  describe('role = user (default)', () => {
    it('should use Prompt_userQuotePromptList when role is not specified', () => {
      const result = getQuotePrompt('4.9.7');
      expect(result).toBe(Prompt_userQuotePromptList[0].value['4.9.7']);
    });

    it('should use Prompt_userQuotePromptList when role is explicitly "user"', () => {
      const result = getQuotePrompt('4.9.7', 'user');
      expect(result).toBe(Prompt_userQuotePromptList[0].value['4.9.7']);
    });

    it('should return highest version when no version is provided', () => {
      const result = getQuotePrompt(undefined, 'user');
      expect(typeof result).toBe('string');
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should fall back to highest version for non-existing version', () => {
      const result = getQuotePrompt('99.99.99', 'user');
      expect(result).toBe(getQuotePrompt(undefined, 'user'));
    });
  });

  describe('role = system', () => {
    it('should use Prompt_systemQuotePromptList when role is "system"', () => {
      const result = getQuotePrompt('4.9.7', 'system');
      expect(result).toBe(Prompt_systemQuotePromptList[0].value['4.9.7']);
    });

    it('should return highest version when no version is provided', () => {
      const result = getQuotePrompt(undefined, 'system');
      expect(typeof result).toBe('string');
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should fall back to highest version for non-existing version', () => {
      const result = getQuotePrompt('99.99.99', 'system');
      expect(result).toBe(getQuotePrompt(undefined, 'system'));
    });
  });

  describe('user vs system prompts differ', () => {
    it('should return different content for user and system roles', () => {
      const userResult = getQuotePrompt('4.9.7', 'user');
      const systemResult = getQuotePrompt('4.9.7', 'system');
      // user prompt contains {{question}}, system prompt does not
      expect(userResult).toContain('{{question}}');
      expect(systemResult).not.toContain('{{question}}');
    });
  });
});

// ===========================================================================
// 6. getDocumentQuotePrompt
// ===========================================================================
describe('getDocumentQuotePrompt', () => {
  it('should return a prompt containing <FilesContent> tags', () => {
    const result = getDocumentQuotePrompt('4.9.7');
    expect(result).toContain('<FilesContent>');
    expect(result).toContain('</FilesContent>');
  });

  it('should return a prompt containing {{quote}} placeholder', () => {
    const result = getDocumentQuotePrompt('4.9.7');
    expect(result).toContain('{{quote}}');
  });

  it('should return the 4.9.7 version when that version is requested', () => {
    const result = getDocumentQuotePrompt('4.9.7');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('should return highest version when no version is provided', () => {
    const result = getDocumentQuotePrompt();
    expect(typeof result).toBe('string');
    expect(result).toContain('{{quote}}');
    expect(result).toContain('<FilesContent>');
  });

  it('should fall back to highest version for non-existing version', () => {
    const result = getDocumentQuotePrompt('99.99.99');
    expect(result).toBe(getDocumentQuotePrompt());
  });

  it('should return the same result for undefined and non-existing version', () => {
    expect(getDocumentQuotePrompt(undefined)).toBe(getDocumentQuotePrompt('0.0.1'));
  });
});
