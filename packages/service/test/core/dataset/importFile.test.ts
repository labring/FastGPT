import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { parseDatasetImportFile } from '@fastgpt/service/core/dataset/importFile';

const createWorkbookBuffer = ({
  sheets
}: {
  sheets: Array<{
    name: string;
    rows: unknown[][];
    merges?: XLSX.Range[];
  }>;
}) => {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows, merges }) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!merges'] = merges;
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

describe('parseDatasetImportFile', () => {
  it('parses valid CSV content and preserves quoted cells', async () => {
    const rawText = await parseDatasetImportFile({
      buffer: Buffer.from(
        'q,a,index,metadata\n"question, one","line 1\nline 2",tag,"{""rank"":1}"'
      ),
      filename: 'template.CSV',
      encoding: 'utf-8'
    });

    expect(Papa.parse(rawText).data).toEqual([
      ['q', 'a', 'index', 'metadata'],
      ['question, one', 'line 1\nline 2', 'tag', '{"rank":1}']
    ]);
  });

  it('parses a single-sheet Excel file and preserves cell boundaries', async () => {
    const buffer = createWorkbookBuffer({
      sheets: [
        {
          name: 'Dataset',
          rows: [
            ['q', 'a', 'index', 'metadata'],
            ['question, one', 'line 1\nline 2', 'tag', '{"source":"excel"}']
          ]
        }
      ]
    });

    const rawText = await parseDatasetImportFile({
      buffer,
      filename: 'template.xlsx',
      encoding: 'utf-8'
    });

    expect(Papa.parse(rawText).data).toEqual([
      ['q', 'a', 'index', 'metadata'],
      ['question, one', 'line 1\nline 2', 'tag', '{"source":"excel"}']
    ]);
  });

  it('accepts legacy headers in Excel files', async () => {
    const buffer = createWorkbookBuffer({
      sheets: [
        {
          name: 'Backup',
          rows: [
            ['q', 'a', 'indexes'],
            ['question', 'answer', 'tag']
          ]
        }
      ]
    });

    await expect(
      parseDatasetImportFile({ buffer, filename: 'backup.xlsx', encoding: 'utf-8' })
    ).resolves.toContain('indexes');
  });

  it.each([
    {
      name: 'an unsupported extension',
      filename: 'template.xls',
      buffer: Buffer.from('q,a\nquestion,answer')
    },
    {
      name: 'malformed CSV content',
      filename: 'template.csv',
      buffer: Buffer.from('q,a\n"question,answer')
    },
    {
      name: 'invalid CSV headers',
      filename: 'template.csv',
      buffer: Buffer.from('question,answer\nquestion,answer')
    }
  ])('rejects $name', async ({ filename, buffer }) => {
    await expect(parseDatasetImportFile({ buffer, filename, encoding: 'utf-8' })).rejects.toThrow();
  });

  it('rejects Excel files with merged cells', async () => {
    const buffer = createWorkbookBuffer({
      sheets: [
        {
          name: 'Dataset',
          rows: [
            ['q', 'a'],
            ['question', 'answer']
          ],
          merges: [{ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }]
        }
      ]
    });

    await expect(
      parseDatasetImportFile({ buffer, filename: 'template.xlsx', encoding: 'utf-8' })
    ).rejects.toThrow('merged cells');
  });

  it('rejects Excel files with multiple worksheets', async () => {
    const buffer = createWorkbookBuffer({
      sheets: [
        { name: 'Dataset 1', rows: [['q', 'a']] },
        { name: 'Dataset 2', rows: [['q', 'a']] }
      ]
    });

    await expect(
      parseDatasetImportFile({ buffer, filename: 'template.xlsx', encoding: 'utf-8' })
    ).rejects.toThrow('exactly one worksheet');
  });

  it('rejects an empty Excel worksheet', async () => {
    const buffer = createWorkbookBuffer({
      sheets: [{ name: 'Dataset', rows: [[]] }]
    });

    await expect(
      parseDatasetImportFile({ buffer, filename: 'template.xlsx', encoding: 'utf-8' })
    ).rejects.toThrow('headers');
  });
});
