import { describe, expect, it } from 'vitest';
import { truncateSandboxToolOutput } from '@fastgpt/service/core/ai/sandbox/application/toolCall/utils';

describe('truncateSandboxToolOutput', () => {
  it('keeps short output unchanged', () => {
    expect(
      truncateSandboxToolOutput({ content: 'a\nb', direction: 'head', maxLines: 3, maxBytes: 10 })
    ).toEqual({
      content: 'a\nb',
      truncated: false,
      truncatedBy: undefined,
      totalLines: 2,
      outputLines: 2,
      outputBytes: 3
    });
  });

  it('keeps the requested side when line count exceeds the limit', () => {
    expect(
      truncateSandboxToolOutput({ content: '1\n2\n3', direction: 'head', maxLines: 2 })
    ).toMatchObject({ content: '1\n2', truncated: true, truncatedBy: 'lines' });
    expect(
      truncateSandboxToolOutput({ content: '1\n2\n3', direction: 'tail', maxLines: 2 })
    ).toMatchObject({ content: '2\n3', truncated: true, truncatedBy: 'lines' });
  });

  it('truncates UTF-8 content without splitting a character', () => {
    expect(
      truncateSandboxToolOutput({ content: '你好吗', direction: 'head', maxBytes: 7 })
    ).toMatchObject({ content: '', truncated: true, truncatedBy: 'bytes', outputBytes: 0 });
    expect(
      truncateSandboxToolOutput({ content: '你好吗', direction: 'tail', maxBytes: 7 })
    ).toMatchObject({ content: '好吗', truncated: true, truncatedBy: 'bytes', outputBytes: 6 });
  });
});
