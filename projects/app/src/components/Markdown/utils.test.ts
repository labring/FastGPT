import { describe, expect, it } from 'vitest';
import { mdTextFormat } from './utils';

describe('mdTextFormat', () => {
  it('should preserve code blocks', () => {
    const input = 'Some text ```const x = 1;``` and more text';
    const output = mdTextFormat(input);
    expect(output).toBe(input);
  });

  it('should format latex with square brackets', () => {
    const input = 'Here is latex: \\[x^2\\]';
    const output = mdTextFormat(input);
    expect(output).toBe('Here is latex: $$x^2$$');
  });

  it('should format latex with round brackets', () => {
    const input = 'Here is latex: \\(y^2\\)';
    const output = mdTextFormat(input);
    expect(output).toBe('Here is latex: $y^2$');
  });

  it('should handle multiple latex expressions', () => {
    const input = '\\[x^2\\] and \\(y^2\\)';
    const output = mdTextFormat(input);
    expect(output).toBe('$$x^2$$ and $y^2$');
  });

  it('should format quote references', () => {
    const input = '[quote:675934a198f46329dfc6d05a]';
    const output = mdTextFormat(input);
    expect(output).toBe('[675934a198f46329dfc6d05a](QUOTE)');
  });

  it('should format quote references without quote: prefix', () => {
    const input = '[675934a198f46329dfc6d05a]';
    const output = mdTextFormat(input);
    expect(output).toBe('[675934a198f46329dfc6d05a](QUOTE)');
  });

  it('should handle multiple quote references', () => {
    const input = '[quote:675934a198f46329dfc6d05a] and [quote:575934a198f46329dfc6d05b]';
    const output = mdTextFormat(input);
    expect(output).toBe('[675934a198f46329dfc6d05a](QUOTE) and [575934a198f46329dfc6d05b](QUOTE)');
  });

  it('should add space between URL and Chinese punctuation', () => {
    const input = 'Visit https://example.com。Click here!';
    const output = mdTextFormat(input);
    expect(output).toBe('Visit https://example.com 。Click here!');
  });

  it('should handle complex text with multiple patterns', () => {
    const input = '```code``` \\[x^2\\] [quote:675934a198f46329dfc6d05a] https://example.com。';
    const output = mdTextFormat(input);
    expect(output).toBe(
      '```code``` $$x^2$$ [675934a198f46329dfc6d05a](QUOTE) https://example.com 。'
    );
  });

  it('should not modify text without special patterns', () => {
    const input = 'Regular text without any special patterns';
    const output = mdTextFormat(input);
    expect(output).toBe(input);
  });

  it('should handle empty string', () => {
    const input = '';
    const output = mdTextFormat(input);
    expect(output).toBe('');
  });
});
