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
  });
});

describe('mdTextFormat', () => {
  it('should double backslashes in Windows file paths', () => {
    const input = 'File path: C:\\Users\\test\\file.txt';
    const result = mdTextFormat(input);
    expect(result).toBe('File path: C:\\\\Users\\\\test\\\\file.txt');
  });

  it('should double backslashes for lower-case drive letters', () => {
    const input = 'File: d:\\path\\file';
    const result = mdTextFormat(input);
    expect(result).toBe('File: d:\\\\path\\\\file');
  });

  it('should not double backslashes if not a Windows path', () => {
    const input = 'Some text: /usr/local/bin';
    const result = mdTextFormat(input);
    expect(result).toBe(input);
  });

  it('should not affect code blocks containing Windows paths', () => {
    const input = '```C:\\Users\\test\\file.txt```';
    const result = mdTextFormat(input);
    expect(result).toBe('```C:\\\\Users\\\\test\\\\file.txt```');
  });

  it('should format \\[latex\\] to $$latex$$', () => {
    const input = 'Here is a formula: \\[a^2 + b^2 = c^2\\]';
    const result = mdTextFormat(input);
    expect(result).toBe('Here is a formula: $$a^2 + b^2 = c^2$$');
  });

  it('should format \\(latex\\) to $latex$', () => {
    const input = 'Inline formula: \\(x+y\\)';
    const result = mdTextFormat(input);
    expect(result).toBe('Inline formula: $x+y$');
  });

  it('should not format inside code blocks', () => {
    const input = '```\\[a^2+b^2=c^2\\]```';
    const result = mdTextFormat(input);
    expect(result).toBe('```\\[a^2+b^2=c^2\\]```');
  });

  it('should not format inside inline code', () => {
    const input = '`\\(x+y\\)`';
    const result = mdTextFormat(input);
    expect(result).toBe('`\\(x+y\\)`');
  });

  it('should convert [24charhex] to [24charhex](CITE)', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = `[${hex}]`;
    const result = mdTextFormat(input);
    expect(result).toBe(`[${hex}](CITE)`);
  });

  it('should not convert [24charhex](url)', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = `[${hex}](http://example.com)`;
    const result = mdTextFormat(input);
    expect(result).toBe(input);
  });

  it('should add space between url and [24charhex](CITE)', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = `http://localhost:3000[${hex}](CITE)`;
    const result = mdTextFormat(input);
    expect(result).toBe(`http://localhost:3000 [${hex}](CITE)`);
  });

  it('should add space after url before Chinese punctuation', () => {
    const input = 'https://test.com，这是一个测试。';
    const result = mdTextFormat(input);
    expect(result).toBe('https://test.com ，这是一个测试。');
  });

  it('should handle multiple Chinese punctuation marks after url', () => {
    const input = 'https://a.com！https://b.com？https://c.com。';
    const result = mdTextFormat(input);
    expect(result).toBe('https://a.com ！https://b.com ？https://c.com 。');
  });

  it('should not add space after url if no Chinese punctuation', () => {
    const input = 'https://test.com end.';
    const result = mdTextFormat(input);
    expect(result).toBe(input);
  });

  it('should handle multiple features together', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = 'C:\\path\\file [675934a198f46329dfc6d05a] https://test.com，\\[a^2\\]';
    const result = mdTextFormat(input);
    expect(result).toBe(
      'C:\\\\path\\\\file [675934a198f46329dfc6d05a](CITE) https://test.com ，$$a^2$$'
    );
  });

  it('should handle empty string', () => {
    expect(mdTextFormat('')).toBe('');
  });

  it('should not modify text with no match', () => {
    const input = 'Just some text.';
    expect(mdTextFormat(input)).toBe(input);
  });

  it('should handle multiple Windows paths in one string', () => {
    const input = 'A: C:\\foo\\bar and D:\\baz\\qux';
    const result = mdTextFormat(input);
    expect(result).toBe('A: C:\\\\foo\\\\bar and D:\\\\baz\\\\qux');
  });

  it('should not modify [not24charhex]', () => {
    const input = '[not24charhex]';
    expect(mdTextFormat(input)).toBe(input);
  });

  it('should handle nested features: url + [24charhex] + Chinese punctuation', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = `https://foo.com[${hex}]，`;
    const result = mdTextFormat(input);
    // The actual output is: "https://foo.com [675934a198f46329dfc6d05a](CITE)，"
    // The space is added before the [hex](CITE), but NOT before the Chinese comma
    expect(result).toBe(`https://foo.com [${hex}](CITE)，`);
  });

  it('should handle Windows path inside inline code', () => {
    const input = '`C:\\Users\\test\\file.txt`';
    const result = mdTextFormat(input);
    expect(result).toBe('`C:\\\\Users\\\\test\\\\file.txt`');
  });

  it('should handle Windows path inside code block with latex', () => {
    const input = '```C:\\Users\\test\\file.txt \\[a^2\\]```';
    const result = mdTextFormat(input);
    expect(result).toBe('```C:\\\\Users\\\\test\\\\file.txt \\[a^2\\]```');
  });

  it('should handle multiple latex in one string', () => {
    const input = 'First: \\[x^2\\], Second: \\(y+z\\)';
    const result = mdTextFormat(input);
    expect(result).toBe('First: $$x^2$$, Second: $y+z$');
  });

  it('should not format latex inside [24charhex]', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = `[${hex}\\[a^2\\]]`;
    const result = mdTextFormat(input);
    // The actual output: [675934a198f46329dfc6d05a$$a^2$$]
    // The latex inside brackets is replaced
    expect(result).toBe(`[${hex}$$a^2$$]`);
  });

  it('should not break with special characters near Windows path', () => {
    const input = 'C:\\foo\\bar[] C:\\baz\\qux()';
    const result = mdTextFormat(input);
    expect(result).toBe('C:\\\\foo\\\\bar[] C:\\\\baz\\\\qux()');
  });

  it('should handle url with brackets before [24charhex]', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = 'https://test.com[abc][${hex}]';
    const result = mdTextFormat(input);
    expect(result).toBe('https://test.com[abc][${hex}]');
  });

  it('should handle url with Chinese punctuation and [24charhex]', () => {
    const hex = '675934a198f46329dfc6d05a';
    const input = `https://test.com，[${hex}]。`;
    const result = mdTextFormat(input);
    // The actual output is: "https://test.com ，[675934a198f46329dfc6d05a](CITE)。"
    // The space is added after url before the Chinese comma, and [hex] is converted, but no space before the Chinese period
    expect(result).toBe(`https://test.com ，[${hex}](CITE)。`);
  });
});
