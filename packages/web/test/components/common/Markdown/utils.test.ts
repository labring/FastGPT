import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchRemoteMarkdown } from '../../../../components/common/Markdown/utils';

describe('fetchRemoteMarkdown', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('successfully fetches and rewrites relative image urls', async () => {
    const markdown =
      '# Hello\n\n![img](./assets/pic.png)\n![relative](images/test.jpg)\n![abs](https://example.com/logo.png)';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => markdown
    } as any);

    const result = await fetchRemoteMarkdown('https://example.com/docs/readme.md');
    expect(result).toBe(
      '# Hello\n\n![img](https://example.com/docs/assets/pic.png)\n![relative](https://example.com/docs/images/test.jpg)\n![abs](https://example.com/logo.png)'
    );
  });

  it('handles network error (Failed to fetch) gracefully without throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await fetchRemoteMarkdown('https://example.com/docs/readme.md');
    expect(result).toBe('');
  });

  it('handles HTTP error status (404) gracefully without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    } as any);

    const result = await fetchRemoteMarkdown('https://example.com/docs/readme.md');
    expect(result).toBe('');
  });
});
