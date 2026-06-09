import { describe, expect, it } from 'vitest';
import {
  filterEmptyTableData,
  formatMarkdownTableCell,
  formatMarkdownTableRow
} from '@fastgpt/service/worker/readFile/extension/utils';

describe('filterEmptyTableData', () => {
  it('should remove empty rows and columns', () => {
    const result = filterEmptyTableData([
      ['', 'name', '', 'age', ''],
      ['', 'Alice', '', 30, ''],
      ['', '', '', '', ''],
      ['', 'Bob', '', 25, '']
    ]);

    expect(result).toEqual([
      ['name', 'age'],
      ['Alice', 30],
      ['Bob', 25]
    ]);
  });

  it('should return empty data when all rows are empty', () => {
    const result = filterEmptyTableData([
      ['', undefined],
      [null, '  ']
    ]);

    expect(result).toEqual([]);
  });
});

describe('formatMarkdownTableCell', () => {
  it('should escape markdown table separators and line breaks', () => {
    expect(formatMarkdownTableCell('name|alias')).toBe('name\\|alias');
    expect(formatMarkdownTableCell('line1\r\nline2\nline3\rline4')).toBe(
      'line1\\nline2\\nline3\\nline4'
    );
    expect(formatMarkdownTableCell(null)).toBe('');
  });
});

describe('formatMarkdownTableRow', () => {
  it('should format escaped markdown table row', () => {
    expect(formatMarkdownTableRow(['name|alias', 'line1\nline2'])).toBe(
      '| name\\|alias | line1\\nline2 |'
    );
  });
});
