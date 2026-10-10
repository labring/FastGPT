/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchRemoteMarkdown,
  parseTableToGrid
} from '../../../../components/common/Markdown/utils';

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

describe('parseTableToGrid (Plan B - Value Replicate Fill)', () => {
  const createTable = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.querySelector('table') as HTMLTableElement;
  };

  it('correctly parses a standard rectangular table without row/colspan', () => {
    const table = createTable(`
      <table>
        <thead>
          <tr><th>Col1</th><th>Col2</th></tr>
        </thead>
        <tbody>
          <tr><td>A1</td><td>B1</td></tr>
          <tr><td>A2</td><td>B2</td></tr>
        </tbody>
      </table>
    `);
    const grid = parseTableToGrid(table);
    expect(grid).toEqual([
      ['Col1', 'Col2'],
      ['A1', 'B1'],
      ['A2', 'B2']
    ]);
  });

  it('correctly replicates values for colspan (Plan B)', () => {
    const table = createTable(`
      <table>
        <thead>
          <tr><th colspan="2">Merged Header</th><th>Other</th></tr>
        </thead>
        <tbody>
          <tr><td>Data1</td><td>Data2</td><td>Data3</td></tr>
        </tbody>
      </table>
    `);
    const grid = parseTableToGrid(table);
    expect(grid).toEqual([
      ['Merged Header', 'Merged Header', 'Other'],
      ['Data1', 'Data2', 'Data3']
    ]);
  });

  it('correctly replicates values for rowspan across subsequent rows (Plan B)', () => {
    const table = createTable(`
      <table>
        <tbody>
          <tr><td rowspan="2">Category A</td><td>Item 1</td></tr>
          <tr><td>Item 2</td></tr>
        </tbody>
      </table>
    `);
    const grid = parseTableToGrid(table);
    // 方案 B：第二行第一列自动复制填充 Category A，且 Item 2 保持在第 2 列，不发生左移
    expect(grid).toEqual([
      ['Category A', 'Item 1'],
      ['Category A', 'Item 2']
    ]);
  });

  it('correctly handles compound rowspan and colspan', () => {
    const table = createTable(`
      <table>
        <tbody>
          <tr><td rowspan="2" colspan="2">Block</td><td>Right 1</td></tr>
          <tr><td>Right 2</td></tr>
          <tr><td>Bottom 1</td><td>Bottom 2</td><td>Bottom 3</td></tr>
        </tbody>
      </table>
    `);
    const grid = parseTableToGrid(table);
    expect(grid).toEqual([
      ['Block', 'Block', 'Right 1'],
      ['Block', 'Block', 'Right 2'],
      ['Bottom 1', 'Bottom 2', 'Bottom 3']
    ]);
  });
});
