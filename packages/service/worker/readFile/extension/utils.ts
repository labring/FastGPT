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
 * 匹配管道符前面的反斜杠串（可为空），以便在转义管道符前先把这些反斜杠成对转义。
 * 否则单元格里本来就有的反斜杠会把我们加上的转义符吃掉，管道符重新变成列分隔符。
 */
const PIPE_ESCAPE_REG = /(?<!\\)(\\*)\|/g;

/**
 * 转义 Markdown table 单元格中的结构字符，避免单元格内容破坏表格列结构。
 */
export const formatMarkdownTableCell = (cell: unknown) => {
  return String(cell ?? '')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(PIPE_ESCAPE_REG, (_match, backslashes: string) => `${backslashes}${backslashes}\\|`);
};

export const formatMarkdownTableRow = (row: unknown[]) => {
  return `| ${row.map(formatMarkdownTableCell).join(' | ')} |`;
};
