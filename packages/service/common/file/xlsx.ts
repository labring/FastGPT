import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { preflightXlsx } from '../../worker/readFile/extension/xlsxPreflight';
import { getXlsxParseLimits } from './xlsxLimits';
import { XlsxValidationError } from './xlsxError';

export type XlsxCellKind = 'text' | 'number';

export type ParsedXlsxTable = {
  sheetName: string;
  rows: string[][];
  cellKinds: XlsxCellKind[][];
  merges: number;
};
type XlsxParseLimitOverrides = {
  maxRows?: number;
  maxColumns?: number;
  maxCells?: number;
  maxMergedCells?: number;
};

/**
 * 将单工作表解析为显示文本，拒绝合并单元格及可能发生隐式转换的单元格类型。
 * 调用方可覆盖行列和单元格预算，解压总量仍由文件大小对应的内存预算约束。
 */
export const parseXlsxTable = async (
  buffer: Buffer,
  limits: XlsxParseLimitOverrides = {}
): Promise<ParsedXlsxTable> => {
  const getCellAddress = (row: number, column: number) =>
    XLSX.utils.encode_cell({ r: row, c: column });

  await preflightXlsx({
    buffer,
    limits: { ...getXlsxParseLimits(buffer.length), ...limits }
  });

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    cellNF: true,
    cellText: true
  });

  if (workbook.SheetNames.length !== 1) {
    throw new XlsxValidationError('XLSX must contain exactly one worksheet', {
      code: 'WORKSHEET_COUNT'
    });
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const merges = worksheet['!merges'] ?? [];
  if (merges.length > 0) {
    throw new XlsxValidationError('XLSX import must not contain merged cells', {
      code: 'MERGED_CELLS'
    });
  }

  const reference = worksheet['!ref'];
  if (!reference) {
    return { sheetName, rows: [], cellKinds: [], merges: 0 };
  }

  const range = XLSX.utils.decode_range(reference);
  const rows: string[][] = [];
  const cellKinds: XlsxCellKind[][] = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const values: string[] = [];
    const kinds: XlsxCellKind[] = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = worksheet[getCellAddress(row, column)] as
        | { t?: string; v?: unknown; w?: string; z?: string; f?: string }
        | undefined;

      if (!cell) {
        values.push('');
        kinds.push('text');
        continue;
      }

      const isDateNumber = cell.t === 'n' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z);
      if (cell.f || cell.t === 'e' || cell.t === 'd' || cell.t === 'b' || isDateNumber) {
        throw new XlsxValidationError(
          `XLSX cell ${getCellAddress(row, column)} has an unsupported type`,
          {
            code: 'CELL_TYPE',
            params: { cell: getCellAddress(row, column) }
          }
        );
      }

      const value = cell.w ?? (cell.v === undefined || cell.v === null ? '' : String(cell.v));
      values.push(value);
      kinds.push(cell.t === 'n' ? 'number' : 'text');
    }
    rows.push(values);
    cellKinds.push(kinds);
  }

  return { sheetName, rows, cellKinds, merges: merges.length };
};

/** 生成纯文本 XLSX 工作簿，显式指定字符串类型，避免下载内容被解释为公式。 */
export const createXlsxBuffer = (rows: string[][]) => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((value) => String(value))));
  for (const cellAddress of Object.keys(worksheet)) {
    if (cellAddress.startsWith('!')) continue;
    const cell = worksheet[cellAddress] as { v?: unknown; t?: string; w?: string };
    cell.t = 's';
    cell.v = String(cell.v ?? '');
    cell.w = String(cell.v);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

/** 为模板首行指定列写入红色字体；仅处理本模块生成的 XLSX，不解析用户上传的样式。 */
export const createXlsxTemplateBuffer = async ({
  rows,
  requiredColumns
}: {
  rows: string[][];
  requiredColumns: number[];
}) => {
  const zip = await JSZip.loadAsync(createXlsxBuffer(rows));
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const styles = parser.parseFromString(
    await zip.file('xl/styles.xml')!.async('string'),
    'application/xml'
  );
  const namespace = styles.documentElement.namespaceURI!;
  const fonts = styles.getElementsByTagName('fonts')[0];
  const fontId = fonts.getElementsByTagName('font').length;
  const font = fonts.getElementsByTagName('font')[0].cloneNode(true);
  const color = styles.createElementNS(namespace, 'color');
  color.setAttribute('rgb', 'FFFF0000');
  // 默认字体可能带主题色，必须移除，避免 Excel 优先显示主题颜色。
  for (let child = font.firstChild; child; ) {
    const next = child.nextSibling;
    if (child.nodeName === 'color') font.removeChild(child);
    child = next;
  }
  font.appendChild(color);
  fonts.appendChild(font);
  fonts.setAttribute('count', String(fontId + 1));
  const formats = styles.getElementsByTagName('cellXfs')[0];
  const styleId = formats.getElementsByTagName('xf').length;
  const format = styles.createElementNS(namespace, 'xf');
  for (const [name, value] of Object.entries({
    numFmtId: '0',
    fontId: String(fontId),
    fillId: '0',
    borderId: '0',
    xfId: '0',
    applyFont: '1'
  })) {
    format.setAttribute(name, value);
  }
  formats.appendChild(format);
  formats.setAttribute('count', String(styleId + 1));
  const sheet = parser.parseFromString(
    await zip.file('xl/worksheets/sheet1.xml')!.async('string'),
    'application/xml'
  );
  const addresses = new Set(
    requiredColumns.map((column) => XLSX.utils.encode_cell({ r: 0, c: column }))
  );
  const cells = sheet.getElementsByTagName('c');
  for (let index = 0; index < cells.length; index++) {
    if (addresses.has(cells[index].getAttribute('r') ?? ''))
      cells[index].setAttribute('s', String(styleId));
  }
  zip.file('xl/styles.xml', serializer.serializeToString(styles));
  zip.file('xl/worksheets/sheet1.xml', serializer.serializeToString(sheet));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
