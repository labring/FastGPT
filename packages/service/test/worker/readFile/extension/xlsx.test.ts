import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { readXlsxRawText } from '@fastgpt/service/worker/readFile/extension/xlsx';

describe('readXlsxRawText', () => {
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
});
