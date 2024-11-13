export enum CodeClassNameEnum {
  guide = 'guide',
  questionGuide = 'questionGuide',
  mermaid = 'mermaid',
  echarts = 'echarts',
  quote = 'quote',
  files = 'files',
  latex = 'latex',
  iframe = 'iframe'
}

function htmlTableToLatex(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');

  if (!table) return '';

  let latex = '\\begin{tabular}{';

  // 获取列数
  const columns = table.querySelectorAll('tr:first-child th, tr:first-child td').length;
  latex += '|' + 'c|'.repeat(columns) + '}\n\\hline\n';

  // 创建一个二维数组来跟踪单元格合并情况
  const cellTracker = Array.from({ length: table.rows.length }, () => Array(columns).fill(false));

  // 遍历行
  table.querySelectorAll('tr').forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('th, td');
    let cellTexts: string[] = [];
    let colIndex = 0;

    cells.forEach((cell) => {
      // 跳过已经被合并的单元格
      while (cellTracker[rowIndex][colIndex]) {
        colIndex++;
      }

      // @ts-ignore
      const rowspan = parseInt(cell.getAttribute('rowspan') || 1, 10);
      // @ts-ignore
      const colspan = parseInt(cell.getAttribute('colspan') || 1, 10);

      // 添加单元格内容
      let cellText = cell.textContent?.trim() || '';
      if (colspan > 1) {
        cellText = `\\multicolumn{${colspan}}{|c|}{${cellText}}`;
      }
      if (rowspan > 1) {
        cellText = `\\multirow{${rowspan}}{*}{${cellText}}`;
      }
      cellTexts.push(cellText);

      // 标记合并的单元格
      for (let i = 0; i < rowspan; i++) {
        for (let j = 0; j < colspan; j++) {
          cellTracker[rowIndex + i][colIndex + j] = true;
        }
      }

      colIndex += colspan;
    });

    latex += cellTexts.join(' & ') + ' \\\\\n\\hline\n';
  });

  latex += '\\end{tabular}';

  return `\`\`\`${CodeClassNameEnum.latex}
    ${latex}
    \`\`\``;
}

export function convertHtmlTablesToLatex(input: string) {
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  return input.replace(tableRegex, (match) => htmlTableToLatex(match));
}
