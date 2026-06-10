/**
 * 清理表格二维数组中的全空行和全空列，保留原始行列顺序。
 * 这里只判断单元格文本是否有有效内容，不做类型转换或业务格式化。
 */
export const filterEmptyTableData = (data: unknown[][]) => {
  const filteredRows = data.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

  const maxColumnLength = Math.max(0, ...filteredRows.map((row) => row.length));
  const columnIndexes = Array.from({ length: maxColumnLength }, (_, index) => index).filter(
    (index) => filteredRows.some((row) => String(row[index] ?? '').trim() !== '')
  );

  return filteredRows.map((row) => columnIndexes.map((index) => row[index] ?? ''));
};

/**
 * 转义 Markdown table 单元格中的结构字符，避免单元格内容破坏表格列结构。
 */
export const formatMarkdownTableCell = (cell: unknown) => {
  return String(cell ?? '')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/\|/g, '\\|');
};

export const formatMarkdownTableRow = (row: unknown[]) => {
  return `| ${row.map(formatMarkdownTableCell).join(' | ')} |`;
};
