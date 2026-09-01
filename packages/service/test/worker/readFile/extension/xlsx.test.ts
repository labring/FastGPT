import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import {
  getXlsxParseLimits,
  readXlsxRawText,
  XLSX_PARSE_LIMITS
} from '@fastgpt/service/worker/readFile/extension/xlsx';

describe('readXlsxRawText', () => {
  const updateWorksheetXml = async ({
    buffer,
    update
  }: {
    buffer: Buffer;
    update: (xml: string) => string;
  }) => {
    const zip = await JSZip.loadAsync(buffer);
    const worksheetPath = 'xl/worksheets/sheet1.xml';
    const worksheetFile = zip.file(worksheetPath);
    if (!worksheetFile) throw new Error('Missing worksheet XML');

    zip.file(worksheetPath, update(await worksheetFile.async('string')));
    return zip.generateAsync({ type: 'nodebuffer' });
  };

  it('uses the task memory estimate as the uncompressed XLSX budget', () => {
    expect(getXlsxParseLimits(1024 * 1024).maxUncompressedBytes).toBe(134 * 1024 * 1024);
  });

  it('should skip empty rows when formatting xlsx content', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['', 'name|alias', '', 'age', 'city', ''],
      ['', 'Alice|A', '', 30, 'Bei\njing', ''],
      [],
      ['', '', '', '', '', ''],
      [undefined, undefined, undefined],
      ['', 'Bob', '', 25, 'Shanghai', '']
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({
      extension: 'xlsx',
      buffer,
      encoding: 'utf-8'
    });

    expect(Papa.parse(result.rawText).data).toEqual([
      ['', 'name|alias', '', 'age', 'city', ''],
      ['', 'Alice|A', '', '30', 'Bei\njing', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', 'Bob', '', '25', 'Shanghai', '']
    ]);
    expect(result.tableInfo).toEqual({
      sheetCount: 1,
      mergedCellCount: 0
    });
    expect(result.formatText).toContain('| name\\|alias | age | city |');
    expect(result.formatText).toContain('| Alice\\|A | 30 | Bei\\njing |');
    expect(result.formatText).toContain('| Bob | 25 | Shanghai |');
    expect(result.formatText).not.toContain('|  |  |  |');
  });

  it('should fill merged cells before formatting xlsx content', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['部门', '姓名', '区域', '', ''],
      ['销售', '张三', '华东', '', ''],
      ['', '李四', '', '', ''],
      ['技术', '王五', '华南', '', ''],
      ['', '', '', '', '']
    ]);

    worksheet['!merges'] = [
      { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
      { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 2 }, e: { r: 2, c: 4 } }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({
      extension: 'xlsx',
      buffer,
      encoding: 'utf-8'
    });

    expect(result.formatText).toContain('| 部门 | 姓名 | 区域 | 区域 | 区域 |');
    expect(result.formatText).toContain('| 销售 | 张三 | 华东 | 华东 | 华东 |');
    expect(result.formatText).toContain('| 销售 | 李四 | 华东 | 华东 | 华东 |');
    expect(result.formatText).toContain('| 技术 | 王五 | 华南 |  |  |');
    expect(result.tableInfo).toEqual({
      sheetCount: 1,
      mergedCellCount: 3
    });
  });

  it('should fill merged cells when sheet data starts from a non-A1 range', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [],
      ['', '部门', '姓名'],
      ['', '销售', '张三'],
      ['', '', '李四']
    ]);

    worksheet['!ref'] = 'B2:C4';
    worksheet['!merges'] = [{ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({
      extension: 'xlsx',
      buffer,
      encoding: 'utf-8'
    });

    expect(result.formatText).toContain('| 部门 | 姓名 |');
    expect(result.formatText).toContain('| 销售 | 张三 |');
    expect(result.formatText).toContain('| 销售 | 李四 |');
    expect(result.tableInfo).toEqual({
      sheetCount: 1,
      mergedCellCount: 1
    });
  });

  it('should report multiple worksheets and preserve CSV cell boundaries', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['q', 'a', 'metadata'],
        ['question, one', 'line 1\nline 2', '{"source":"excel"}']
      ]),
      'Sheet1'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['q', 'a'],
        ['question two', 'answer two']
      ]),
      'Sheet2'
    );
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({
      extension: 'xlsx',
      buffer,
      encoding: 'utf-8'
    });

    expect(result.rawText).toContain('"question, one"');
    expect(result.rawText).toContain('"line 1\nline 2"');
    expect(result.tableInfo).toEqual({
      sheetCount: 2,
      mergedCellCount: 0
    });
  });

  const createWorkbookBuffer = ({
    range,
    merges = []
  }: {
    range: XLSX.Range;
    merges?: XLSX.Range[];
  }) => {
    const worksheet = XLSX.utils.aoa_to_sheet([['value']]);
    worksheet['!ref'] = XLSX.utils.encode_range(range);
    worksheet['!merges'] = merges;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  };

  it('should reject a worksheet that exceeds the row limit', async () => {
    const buffer = createWorkbookBuffer({
      range: {
        s: { r: 0, c: 0 },
        e: { r: XLSX_PARSE_LIMITS.maxRows, c: 0 }
      }
    });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      `maximum row limit of ${XLSX_PARSE_LIMITS.maxRows}`
    );
  });

  it('should reject a sparse worksheet whose first cell is after the row limit', async () => {
    const firstCellAfterLimit = XLSX.utils.encode_cell({
      r: XLSX_PARSE_LIMITS.maxRows,
      c: 0
    });
    const worksheet: XLSX.WorkSheet = {
      [firstCellAfterLimit]: { t: 's', v: 'value' },
      '!ref': firstCellAfterLimit
    };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      `maximum row limit of ${XLSX_PARSE_LIMITS.maxRows}`
    );
  });

  it('should reject cells outside a forged smaller worksheet dimension', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['a', 'b'],
      ['c', 'd']
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const originalBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const buffer = await updateWorksheetXml({
      buffer: originalBuffer,
      update: (xml) => xml.replace('<dimension ref="A1:B2"/>', '<dimension ref="A1:A1"/>')
    });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      'contains cells outside its declared range'
    );
  });

  it('should parse a sparse worksheet whose first cell is at the row limit', async () => {
    const lastAllowedCell = XLSX.utils.encode_cell({
      r: XLSX_PARSE_LIMITS.maxRows - 1,
      c: 0
    });
    const worksheet: XLSX.WorkSheet = {
      [lastAllowedCell]: { t: 's', v: 'value' },
      '!ref': lastAllowedCell
    };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await expect(
      readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })
    ).resolves.toMatchObject({
      rawText: 'value',
      tableInfo: {
        sheetCount: 1
      }
    });
  });

  it('should reject a worksheet that exceeds the column limit', async () => {
    const buffer = createWorkbookBuffer({
      range: {
        s: { r: 0, c: 0 },
        e: { r: 0, c: XLSX_PARSE_LIMITS.maxColumns }
      }
    });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      `maximum column limit of ${XLSX_PARSE_LIMITS.maxColumns}`
    );
  });

  it('should reject a workbook that exceeds the total cell limit', async () => {
    const columnCount = 100;
    const rowCount = Math.floor(XLSX_PARSE_LIMITS.maxCells / columnCount) + 1;
    const buffer = createWorkbookBuffer({
      range: {
        s: { r: 0, c: 0 },
        e: { r: rowCount - 1, c: columnCount - 1 }
      }
    });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      `maximum cell limit of ${XLSX_PARSE_LIMITS.maxCells}`
    );
  });

  it('should reject a merge range outside worksheet bounds before backfilling', async () => {
    const buffer = createWorkbookBuffer({
      range: {
        s: { r: 0, c: 0 },
        e: { r: 0, c: 0 }
      },
      merges: [
        {
          s: { r: 0, c: 0 },
          e: { r: XLSX_PARSE_LIMITS.maxRows, c: XLSX_PARSE_LIMITS.maxColumns }
        }
      ]
    });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      'merge range outside worksheet bounds'
    );
  });

  it('should reject overlapping merges that exceed the global fill limit', async () => {
    const merge = {
      s: { r: 0, c: 0 },
      e: { r: 99_999, c: 5 }
    };
    const buffer = createWorkbookBuffer({
      range: merge,
      merges: [merge, merge]
    });

    await expect(readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' })).rejects.toThrow(
      `maximum merged-cell fill limit of ${XLSX_PARSE_LIMITS.maxMergedCells}`
    );
  });
});
