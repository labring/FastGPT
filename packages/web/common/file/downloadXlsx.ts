import { XLSX_CONTENT_TYPE } from '@fastgpt/global/common/file/constants';
import {
  encodeWorksheetRow,
  planWorkbook,
  worksheetEnd,
  worksheetStart
} from '@fastgpt/global/common/file/xlsx/workbook';

/** 在浏览器将已有表格写成单工作表 XLSX，保留单元格原始文本。 */
export async function downloadXlsx(filename: string, rows: readonly (readonly string[])[]) {
  const { default: JSZip } = await import('jszip');
  const name = 'Sheet1';
  const { worksheets, metadata } = planWorkbook([name]);
  const zip = new JSZip();
  for (const { path, xml } of metadata) zip.file(path, xml);
  const data = rows.map((row, index) =>
    encodeWorksheetRow({ sheet: name, rowNumber: index + 1 }, row)
  );
  zip.file(worksheets[0].path, [worksheetStart, ...data, worksheetEnd].join(''));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: XLSX_CONTENT_TYPE
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
