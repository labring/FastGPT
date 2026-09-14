import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createXlsxTemplateBuffer, parseXlsxTable } from '@fastgpt/service/common/file/xlsx';

describe('parseXlsxTable', () => {
  it.each(['WORKSHEET_COUNT', 'MERGED_CELLS', 'CELL_TYPE', 'ROWS_LIMIT', 'COLUMNS_LIMIT'])(
    'preserves structured validation code %s',
    async (code) => {
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Username', 'Password'],
        ['alice', 'Password1!']
      ]);
      if (code === 'MERGED_CELLS') sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      if (code === 'CELL_TYPE') sheet.B2 = { t: 'b', v: true };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Users');
      if (code === 'WORKSHEET_COUNT')
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['extra']]), 'Extra');
      await expect(
        parseXlsxTable(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
          maxRows: code === 'ROWS_LIMIT' ? 1 : 3,
          maxColumns: code === 'COLUMNS_LIMIT' ? 1 : 3
        })
      ).rejects.toMatchObject({
        name: 'XlsxValidationError',
        detail: { code, ...(code === 'CELL_TYPE' ? { params: { cell: 'B2' } } : {}) }
      });
    }
  );
});

describe('createXlsxTemplateBuffer', () => {
  it('writes a red font only for required headers and preserves plain-text data', async () => {
    const rows = [
      ['Username *', 'Password *', 'Nickname'],
      ['alice', 'Password1!', '=1+1']
    ];
    const buffer = await createXlsxTemplateBuffer({ rows, requiredColumns: [0, 1] });
    expect((await parseXlsxTable(buffer)).rows).toEqual(rows);
    const zip = await JSZip.loadAsync(buffer);
    const parser = new DOMParser();
    const styles = parser.parseFromString(
      await zip.file('xl/styles.xml')!.async('string'),
      'application/xml'
    );
    const sheet = parser.parseFromString(
      await zip.file('xl/worksheets/sheet1.xml')!.async('string'),
      'application/xml'
    );
    const cells = Array.from(sheet.getElementsByTagName('c'));
    const formats = styles.getElementsByTagName('cellXfs')[0].getElementsByTagName('xf');
    const fonts = styles.getElementsByTagName('fonts')[0].getElementsByTagName('font');
    for (const address of ['A1', 'B1']) {
      const cell = cells.find((item) => item.getAttribute('r') === address)!;
      const format = formats[Number(cell.getAttribute('s'))];
      const font = fonts[Number(format.getAttribute('fontId'))];
      expect(font.getElementsByTagName('color')[0].getAttribute('rgb')).toBe('FFFF0000');
    }
    for (const address of ['C1', 'A2', 'B2', 'C2']) {
      const cell = cells.find((item) => item.getAttribute('r') === address)!;
      expect(Number(cell.getAttribute('s') || 0)).toBe(0);
    }
  });
});
