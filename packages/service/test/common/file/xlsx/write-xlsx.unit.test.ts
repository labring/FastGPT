import { PassThrough, Writable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { setTimeout } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';
import { writeXlsx, type Worksheet } from '@fastgpt/global/common/file/xlsx/write-xlsx';
import { encodeWorksheetRow } from '@fastgpt/global/common/file/xlsx/workbook';

const discard = () => new Writable({ write: (_chunk, _encoding, done) => done() });

describe('writeXlsx', () => {
  it('保留工作表顺序、空表和原始文本', async () => {
    const values = [
      '0035',
      '  🙂𠮷 & <>  ',
      '=2+3',
      '_x0041__x0042_',
      'a\u0001b\r\n\t',
      '中'.repeat(32_768),
      'line\n'.repeat(254) + 'end'
    ];
    const sheets: Worksheet[] = [
      { name: '审计', rows: () => [values] },
      {
        name: '详情 & "引用"',
        async *rows() {
          yield ['明细'];
        }
      },
      { name: '空表', rows: () => [] }
    ];
    const destination = new PassThrough();
    const [, bytes] = await Promise.all([writeXlsx({ sheets, destination }), buffer(destination)]);
    const workbook = XLSX.read(bytes, { type: 'buffer', cellHTML: false });

    expect(workbook.SheetNames).toEqual(sheets.map(({ name }) => name));
    expect(workbook.Sheets['详情 & "引用"'].A1.v).toBe('明细');
    expect(workbook.Sheets['空表']['!ref']).toBeUndefined();
    for (const [index, value] of values.entries()) {
      const cell = workbook.Sheets['审计'][XLSX.utils.encode_cell({ r: 0, c: index })];
      expect(cell).toMatchObject({ t: 's', v: value });
      expect(cell.f).toBeUndefined();
    }
  });

  it('省略空格时保留后续单元格的坐标和空白字符', async () => {
    const destination = new PassThrough();
    const [, bytes] = await Promise.all([
      writeXlsx({
        sheets: [{ name: 'Dataset', omitEmptyCells: true, rows: () => [['q', '', ' ', 'meta']] }],
        destination
      }),
      buffer(destination)
    ]);
    const { Dataset } = XLSX.read(bytes, { type: 'buffer' }).Sheets;
    expect(Dataset.B1).toBeUndefined();
    expect(Dataset.C1.v).toBe(' ');
    expect(Dataset.D1.v).toBe('meta');
  });

  it.each([[], ['Data', 'DATA'], ['a/b'], ['History'], ['表'.repeat(32)]])(
    '拒绝无效工作表 %j，且不读取行',
    async (...names) => {
      const rows = vi.fn(() => []);
      const sheets = names.map((name) => ({ name, rows }));
      const destination = discard();
      await expect(writeXlsx({ sheets, destination })).rejects.toThrow(/工作簿|工作表/);
      expect(rows).not.toHaveBeenCalled();
      expect(destination.writableLength).toBe(0);
    }
  );

  it('生成期间中止会退出当前行源，且不打开后续工作表', async () => {
    const controller = new AbortController();
    const opened = Promise.withResolvers<void>();
    const closeRows = vi.fn();
    const laterRows = vi.fn(() => []);
    const reason = new Error('cancel export');
    const destination = discard();
    const writing = writeXlsx({
      sheets: [
        { name: '表一', rows: () => [['first']] },
        {
          name: '表二',
          async *rows(signal) {
            try {
              opened.resolve();
              await setTimeout(10_000, undefined, { signal });
              yield ['second'];
            } finally {
              closeRows();
            }
          }
        },
        { name: '表三', rows: laterRows }
      ],
      destination,
      signal: controller.signal
    });
    const rejected = expect(writing).rejects.toBe(reason);

    await Promise.race([opened.promise, writing]);
    controller.abort(reason);

    await rejected;
    expect(closeRows).toHaveBeenCalledOnce();
    expect(laterRows).not.toHaveBeenCalled();
    expect(destination.destroyed).toBe(true);
  });
});

describe('encodeWorksheetRow', () => {
  it('允许 Excel 最大行号和列数', () => {
    const values = Array<string>(16_384).fill('');
    expect(encodeWorksheetRow({ sheet: '测试', rowNumber: 1_048_576 }, values)).toContain(
      'XFD1048576'
    );
  });
});
