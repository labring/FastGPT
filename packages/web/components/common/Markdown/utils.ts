/**
 * 读取 README 并修正相对图片地址，避免远端 markdown 图片在弹窗中失效。
 */
export const fetchRemoteMarkdown = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch markdown: ${response.status}`);
      return '';
    }

    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    const content = await response.text();

    return content
      .replace(
        /!\[([^\]]*)\]\(\.\/([^)]+)\)/g,
        (match, alt, path) => `![${alt}](${baseUrl}${path})`
      )
      .replace(
        /!\[([^\]]*)\]\((?!http|https|\/\/)([^)]+)\)/g,
        (match, alt, path) => `![${alt}](${baseUrl}${path})`
      );
  } catch (error) {
    console.error('Failed to fetch remote markdown:', error);
    return '';
  }
};

/**
 * Escape special characters in CSV cell content
 * @param cell - Cell content to escape
 * @returns Escaped cell content
 */
export const escapeCsvCell = (cell: string): string => {
  // Remove leading/trailing whitespace
  let content = cell.trim();

  // If cell contains comma, double quote, or newline, wrap in quotes
  if (content.includes(',') || content.includes('"') || content.includes('\n')) {
    // Escape existing double quotes by doubling them
    content = content.replace(/"/g, '""');
    content = `"${content}"`;
  }

  return content;
};

/**
 * 将 HTML table 元素解析为二维矩阵网格，单元格保留原始文本（不做 CSV 转义），
 * 由各导出格式（CSV / Markdown）在写出时按自己的语法转义。
 * 针对合并单元格（rowspan / colspan），采用方案 B（值复制填充）：
 * 将合并单元格的值复制填充到其所覆盖的每一个二维虚拟网格中，
 * 保证导出的 CSV 结构绝对对齐、不发生行/列串位，且对数据分析与透视表筛选友好。
 */
export const parseTableToGrid = (tableElement: HTMLTableElement): string[][] => {
  const grid: string[][] = [];

  // 收集所有行（保持 thead -> tbody -> tfoot 顺序；若无分段则直接取所有 tr）
  let trList: HTMLTableRowElement[] = [];
  const thead = tableElement.querySelector('thead');
  const tbody = tableElement.querySelector('tbody');
  const tfoot = tableElement.querySelector('tfoot');

  if (thead || tbody || tfoot) {
    if (thead) trList.push(...Array.from(thead.querySelectorAll('tr')));
    if (tbody) trList.push(...Array.from(tbody.querySelectorAll('tr')));
    if (tfoot) trList.push(...Array.from(tfoot.querySelectorAll('tr')));
  } else {
    trList = Array.from(tableElement.querySelectorAll('tr'));
  }

  let rowIndex = 0;

  for (const row of trList) {
    if (!grid[rowIndex]) {
      grid[rowIndex] = [];
    }

    let colIndex = 0;
    // 获取当前行直属的所有单元格节点（th 或 td）
    const cells = Array.from(row.children).filter(
      (child): child is HTMLTableCellElement =>
        child.tagName.toLowerCase() === 'th' || child.tagName.toLowerCase() === 'td'
    );

    for (const cell of cells) {
      // 跳过已被前一行（因 rowspan 延伸占用）预占的列
      while (grid[rowIndex][colIndex] !== undefined) {
        colIndex++;
      }

      const cellText = cell.textContent || '';
      const rowspan = Math.max(parseInt(cell.getAttribute('rowspan') || '1', 10) || 1, 1);
      const colspan = Math.max(parseInt(cell.getAttribute('colspan') || '1', 10) || 1, 1);

      // 方案 B：值复制填充（覆盖整个 rowspan x colspan 区域）
      for (let r = 0; r < rowspan; r++) {
        const targetRow = rowIndex + r;
        if (!grid[targetRow]) {
          grid[targetRow] = [];
        }
        for (let c = 0; c < colspan; c++) {
          const targetCol = colIndex + c;
          grid[targetRow][targetCol] = cellText;
        }
      }

      colIndex += colspan;
    }

    rowIndex++;
  }

  // 保证每一行单元格中的空穴补齐空字符串，且各行对齐到最大列数
  const maxCols = grid.reduce((max, row) => Math.max(max, row.length), 0);
  for (const row of grid) {
    for (let c = 0; c < maxCols; c++) {
      if (row[c] === undefined) {
        row[c] = '';
      }
    }
  }

  return grid;
};

/** 按 CSV 语法写出一行：只有需要在 CSV 中转义的单元格才加引号。 */
const stringifyCsvRow = (row: string[]) => row.map((cell) => escapeCsvCell(cell)).join(',');

/**
 * Export table data to CSV format
 * @param tableElement - HTML table element to export
 * @param filename - Name of the exported file (without extension)
 */
export const exportTableToCSV = (tableElement: HTMLTableElement, filename: string = 'table') => {
  const grid = parseTableToGrid(tableElement);
  if (grid.length === 0) return;

  // Convert to CSV format
  const csvContent = grid.map((row) => stringifyCsvRow(row)).join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Trigger download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 将 HTML table 元素解析为 CSV 文本字符串
 */
export const parseTableToCSVString = (tableElement: HTMLTableElement): string => {
  const grid = parseTableToGrid(tableElement);
  if (grid.length === 0) return '';
  return grid.map((row) => stringifyCsvRow(row)).join('\n');
};

/**
 * 将 HTML table 元素解析为 Markdown 表格字符串。
 * 单元格文本保持原文，只按 Markdown 表格语法转义 `|` 并把换行折叠成空格，
 * 不能复用 CSV 的引号转义，否则复制出来的 Markdown 里会出现 `"1,234"` 这类多余引号。
 */
export const parseTableToMarkdownString = (tableElement: HTMLTableElement): string => {
  const grid = parseTableToGrid(tableElement);
  if (grid.length === 0) return '';

  const formatCell = (val: string) => val.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

  const headerRow = grid[0];
  const maxCols = headerRow.length;
  const mdHeader = `| ${headerRow.map(formatCell).join(' | ')} |`;
  const mdDivider = `| ${new Array(maxCols).fill('---').join(' | ')} |`;
  const mdBody = grid
    .slice(1)
    .map((row) => `| ${row.map(formatCell).join(' | ')} |`)
    .join('\n');

  return [mdHeader, mdDivider, mdBody].filter(Boolean).join('\n');
};
