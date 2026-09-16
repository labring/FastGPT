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

  it('should keep a backslash in front of a pipe from eating the escape', () => {
    // 单元格里本来就有的反斜杠会把转义符吃掉，管道符重新变成列分隔符，
    // 所以要先把反斜杠串成对转义。
    expect(formatMarkdownTableCell('a\\|b')).toBe('a\\\\\\|b');
    expect(formatMarkdownTableCell('a\\\\|b')).toBe('a\\\\\\\\\\|b');
    // 不带管道符的反斜杠保持原样。
    expect(formatMarkdownTableCell('C:\\path')).toBe('C:\\path');
  });
});

describe('formatMarkdownTableRow', () => {
  it('should format escaped markdown table row', () => {
    expect(formatMarkdownTableRow(['name|alias', 'line1\nline2'])).toBe(
      '| name\\|alias | line1\\nline2 |'
    );
  });
});
