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

  it('writes a long whole number in full instead of in scientific notation', async () => {
    // Excel's General format shows a number past 11 digits as 1.23457E+12, and
    // an order number or phone number read that way has lost its digits.
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['订单号', '手机号', '金额', '比例', '极小值', '科学计数'],
      [1234567890123, 8613812345678, 1234.5, 0.1 + 0.2, 1.5e-10, 1234567890123]
    ]);
    // A format the author chose is kept as it is.
    worksheet['F2'].z = '0.00E+00';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({
      extension: 'xlsx',
      buffer,
      encoding: 'utf-8'
    });

    expect(Papa.parse(result.rawText).data).toEqual([
      ['订单号', '手机号', '金额', '比例', '极小值', '科学计数'],
      ['1234567890123', '8613812345678', '1234.5', '0.3', '1.5E-10', '1.23E+12']
    ]);
    expect(result.formatText).toContain(
      '| 1234567890123 | 8613812345678 | 1234.5 | 0.3 | 1.5E-10 | 1.23E+12 |'
    );
  });

  it('keeps SheetJS formatting for integers outside the safe range', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['unsafe', 'huge'],
      [9007199254740992, 1e21]
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
      ['unsafe', 'huge'],
      ['9.0072E+15', '1E+21']
    ]);
  });

  it.each([false, true])('writes default dates as ISO dates (date1904=%s)', async (date1904) => {
    // Excel shows its default short date (format 14) and date-time (format 22) in the
    // system's locale, 2026/10/17 in a Chinese Excel. SheetJS writes them as the US
    // m/d/yy, "10/17/26", which drops the century and leaves day and month ambiguous.
    const dateSerial = date1904 ? 44850 : 46312;
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['短日期', '日期时间', '中文日期', '日/月/年', '时间'],
      [dateSerial, dateSerial + 0.75, dateSerial, dateSerial, 0.5]
    ]);
    worksheet['A2'].z = XLSX.SSF.get_table()[14] as string;
    worksheet['B2'].z = XLSX.SSF.get_table()[22] as string;
    // Formats the author chose are kept as they are.
    worksheet['C2'].z = 'yyyy"年"m"月"d"日"';
    worksheet['D2'].z = 'dd/mm/yyyy';
    worksheet['E2'].z = 'h:mm';
    const workbook = XLSX.utils.book_new();
    workbook.Workbook = { WBProps: { date1904 } };
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({
      extension: 'xlsx',
      buffer,
      encoding: 'utf-8'
    });

    expect(Papa.parse(result.rawText).data).toEqual([
      ['短日期', '日期时间', '中文日期', '日/月/年', '时间'],
      ['2026-10-17', '2026-10-17 18:00', '2026年10月17日', '17/10/2026', '12:00']
    ]);
    expect(result.formatText).toContain(
      '| 2026-10-17 | 2026-10-17 18:00 | 2026年10月17日 | 17/10/2026 | 12:00 |'
    );
  });

  it('keeps early 1900 dates on either side of the Excel leap-day boundary', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['短日期', '日期时间'],
      [1, 1],
      [59, 59.5],
      [61, 61.75]
    ]);
    for (const row of [2, 3, 4]) {
      worksheet[`A${row}`].z = XLSX.SSF.get_table()[14] as string;
      worksheet[`B${row}`].z = XLSX.SSF.get_table()[22] as string;
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' });

    expect(Papa.parse(result.rawText).data).toEqual([
      ['短日期', '日期时间'],
      ['1900-01-01', '1900-01-01 00:00'],
      ['1900-02-28', '1900-02-28 12:00'],
      ['1900-03-01', '1900-03-01 18:00']
    ]);
    expect(result.formatText).toContain('| 1900-01-01 | 1900-01-01 00:00 |');
    expect(result.formatText).toContain('| 1900-02-28 | 1900-02-28 12:00 |');
    expect(result.formatText).toContain('| 1900-03-01 | 1900-03-01 18:00 |');
  });

  it('keeps a timezone-free date-time inside a daylight saving gap', async () => {
    // 2026-03-08 02:30 在 America/Los_Angeles 的本地时区不存在，但 Excel 日期没有时区。
    // 此用例需在该 TZ 下运行，才能检测经 JavaScript Date 转换时被归一化为 03:30 的回归。
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['短日期', '日期时间'],
      [46089, 46089 + 2.5 / 24]
    ]);
    worksheet['A2'].z = XLSX.SSF.get_table()[14] as string;
    worksheet['B2'].z = XLSX.SSF.get_table()[22] as string;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' });

    expect(Papa.parse(result.rawText).data).toEqual([
      ['短日期', '日期时间'],
      ['2026-03-08', '2026-03-08 02:30']
    ]);
    expect(result.formatText).toContain('| 2026-03-08 | 2026-03-08 02:30 |');
  });

  it('normalizes custom formats equivalent to the default date formats', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['短日期', '日期时间', '文本'],
      [46312, 46312.75, '03/04/26']
    ]);
    worksheet['A2'].z = 'm/d/yy';
    worksheet['B2'].z = 'm/d/yy h:mm';
    worksheet['C2'].z = 'm/d/yy';
    // 用自定义格式 ID 保存同样的格式串，明确归一化依据是格式文本而非 numFmtId。
    const workbook = {
      ...XLSX.utils.book_new(),
      SSF: {
        ...XLSX.SSF.get_table(),
        200: 'm/d/yy',
        201: 'm/d/yy h:mm'
      }
    };
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await readXlsxRawText({ extension: 'xlsx', buffer, encoding: 'utf-8' });

    expect(Papa.parse(result.rawText).data).toEqual([
      ['短日期', '日期时间', '文本'],
      ['2026-10-17', '2026-10-17 18:00', '03/04/26']
    ]);
    expect(result.formatText).toContain('| 2026-10-17 | 2026-10-17 18:00 | 03/04/26 |');
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
