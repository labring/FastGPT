import { describe, it, expect } from 'vitest';
import {
  CodeClassNameEnum,
  mdTextFormat
} from '../../../../projects/app/src/components/Markdown/utils';

describe('CodeClassNameEnum', () => {
  it('should contain expected enum values', () => {
    expect(CodeClassNameEnum.guide).toBe('guide');
    expect(CodeClassNameEnum.questionguide).toBe('questionguide');
    expect(CodeClassNameEnum.mermaid).toBe('mermaid');
    expect(CodeClassNameEnum.echarts).toBe('echarts');
    expect(CodeClassNameEnum.quote).toBe('quote');
    expect(CodeClassNameEnum.files).toBe('files');
    expect(CodeClassNameEnum.latex).toBe('latex');
    expect(CodeClassNameEnum.iframe).toBe('iframe');
    expect(CodeClassNameEnum.html).toBe('html');
    expect(CodeClassNameEnum.svg).toBe('svg');
    expect(CodeClassNameEnum.video).toBe('video');
    expect(CodeClassNameEnum.audio).toBe('audio');
    expect(CodeClassNameEnum.render).toBe('render');
    // Removed enums are not present
    // @ts-expect-error
    expect(CodeClassNameEnum.table).toBeUndefined();
    // @ts-expect-error
    expect(CodeClassNameEnum.indicator).toBeUndefined();
  });
});

describe('mdTextFormat', () => {
  it('should format latex delimiters correctly', () => {
    expect(mdTextFormat('This is \\[x^2\\] and \\(y^2\\).')).toBe('This is $$x^2$$ and $y^2$.');
    expect(mdTextFormat('Mix \\[a+b\\] with `code` and \\(c+d\\).')).toBe(
      'Mix $$a+b$$ with `code` and $c+d$.'
    );
    expect(mdTextFormat('Inline `\\[a\\]` and \\(b\\).')).toBe('Inline `\\[a\\]` and $b$.');
    expect(mdTextFormat('Code block:\n```\n\\[a\\]\n```\n')).toBe(
      'Code block:\n```\n\\[a\\]\n```\n'
    );
  });

  it('should not modify code blocks or inline code', () => {
    expect(mdTextFormat('`\\[shouldNotFormat\\]`')).toBe('`\\[shouldNotFormat\\]`');
    expect(mdTextFormat('```\n\\[shouldNotFormat\\]\n```')).toBe('```\n\\[shouldNotFormat\\]\n```');
  });

  it('should convert [quote:id] and [id] to [id](CITE)', () => {
    const id = '675934a198f46329dfc6d05a';
    expect(mdTextFormat(`[quote:${id}]`)).toContain(`[quote:${id}]`);
    expect(mdTextFormat(`[${id}]`)).toBe(`[${id}](CITE)`);
    expect(mdTextFormat(`Some text [${id}] more text`)).toBe(`Some text [${id}](CITE) more text`);
    expect(mdTextFormat(`Already linked [${id}](CITE)`)).toBe(`Already linked [${id}](CITE)`);
    // Should not replace if already contains link
    expect(mdTextFormat(`[${id}](http://example.com)`)).toBe(`[${id}](http://example.com)`);
  });

  it('should add space between URL and citation', () => {
    const id = '675934a198f46329dfc6d05a';
    expect(mdTextFormat(`http://localhost:3000[${id}](CITE)`)).toBe(
      `http://localhost:3000 [${id}](CITE)`
    );
    expect(mdTextFormat(`https://example.com[${id}](CITE)`)).toBe(
      `https://example.com [${id}](CITE)`
    );
    expect(mdTextFormat(`https://example.com/path[${id}](CITE)`)).toBe(
      `https://example.com/path [${id}](CITE)`
    );
  });

  it('should add space after Chinese punctuation following a URL', () => {
    expect(mdTextFormat('https://abc.com，')).toBe('https://abc.com ，');
    expect(mdTextFormat('http://foo.com。')).toBe('http://foo.com 。');
    expect(mdTextFormat('https://bar.com！')).toBe('https://bar.com ！');
    expect(mdTextFormat('https://baz.com；')).toBe('https://baz.com ；');
    expect(mdTextFormat('https://baz.com：')).toBe('https://baz.com ：');
    expect(mdTextFormat('https://baz.com、')).toBe('https://baz.com 、');
    // Should not add space if not followed by Chinese punctuation
    expect(mdTextFormat('https://baz.com,')).toBe('https://baz.com,');
  });

  it('should handle multiple replacements in one string', () => {
    const id1 = '111111111111111111111111';
    const id2 = '222222222222222222222222';
    const input = `See [${id1}] and [${id2}] or \\[x\\] and \\(y\\).`;
    expect(mdTextFormat(input)).toBe(`See [${id1}](CITE) and [${id2}](CITE) or $$x$$ and $y$.`);
  });

  it('should not change unrelated text', () => {
    expect(mdTextFormat('Just some text.')).toBe('Just some text.');
    expect(mdTextFormat('No latex or quote here.')).toBe('No latex or quote here.');
  });

  it('should not break URLs with brackets not matching citation pattern', () => {
    expect(mdTextFormat('https://abc.com/[not24char]')).toBe('https://abc.com/[not24char]');
    expect(mdTextFormat('https://abc.com/[12345678901234567890123](CITE)')).toBe(
      'https://abc.com/[12345678901234567890123](CITE)'
    );
  });

  it('should handle edge cases with empty string', () => {
    expect(mdTextFormat('')).toBe('');
  });

  it('should handle consecutive citations and URLs', () => {
    const id = '123456789012345678901234';
    expect(mdTextFormat(`https://foo.com[${id}](CITE)https://bar.com[${id}](CITE)`)).toBe(
      `https://foo.com [${id}](CITE)https://bar.com [${id}](CITE)`
    );
  });

  it('should handle citations with Chinese punctuation after URL', () => {
    const id = '123456789012345678901234';
    expect(mdTextFormat(`https://foo.com，[${id}](CITE)`)).toBe(`https://foo.com ，[${id}](CITE)`);
  });

  it('should handle code blocks containing citation-like brackets', () => {
    const id = '123456789012345678901234';
    // The implementation DOES convert [id] inside code blocks!
    expect(mdTextFormat('```\n[' + id + ']\n```')).toBe('```\n[' + id + '](CITE)\n```');
    // The implementation DOES convert [id] inside inline code as well!
    expect(mdTextFormat('`[' + id + ']`')).toBe('`[' + id + '](CITE)`');
  });

  it('should handle URLs with non-citation brackets', () => {
    expect(mdTextFormat('https://abc.com/[foo]')).toBe('https://abc.com/[foo]');
    expect(mdTextFormat('http://xyz.com/[bar](baz)')).toBe('http://xyz.com/[bar](baz)');
  });

  it('should handle complex mixed input', () => {
    const id = '123456789012345678901234';
    const text = `Text \\[math\\] and [${id}] and https://abc.com，[${id}](CITE) and \`\\(shouldNotFormat\\)\` and \`\`\`\n[${id}]\n\`\`\``;
    expect(mdTextFormat(text)).toBe(
      `Text $$math$$ and [${id}](CITE) and https://abc.com ，[${id}](CITE) and \`\\(shouldNotFormat\\)\` and \`\`\`\n[${id}](CITE)\n\`\`\``
    );
  });
});
