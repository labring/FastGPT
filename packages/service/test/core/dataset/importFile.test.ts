import { beforeEach, describe, expect, it, vi } from 'vitest';
import Papa from 'papaparse';

const mockReadRawTextByLocalFile = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/file/read/utils', () => ({
  readRawTextByLocalFile: mockReadRawTextByLocalFile
}));

import { parseDatasetImportFile } from '@fastgpt/service/core/dataset/importFile';

const defaultParams = {
  teamId: 'team-id',
  tmbId: 'tmb-id',
  filePath: '/tmp/template.csv',
  filename: 'template.csv',
  encoding: 'utf-8'
};

describe('parseDatasetImportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid CSV content from the system readFile worker', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a,index,metadata\n"question, one","line 1\nline 2",tag,"{""rank"":1}"'
    });

    const rawText = await parseDatasetImportFile({
      ...defaultParams,
      filename: 'template.CSV'
    });

    expect(mockReadRawTextByLocalFile).toHaveBeenCalledWith({
      teamId: defaultParams.teamId,
      tmbId: defaultParams.tmbId,
      path: defaultParams.filePath,
      encoding: defaultParams.encoding,
      getFormatText: false
    });
    expect(Papa.parse(rawText).data).toEqual([
      ['q', 'a', 'index', 'metadata'],
      ['question, one', 'line 1\nline 2', 'tag', '{"rank":1}']
    ]);
  });

  it('accepts a single-sheet Excel result without merged cells', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a,index,metadata\n"question, one","line 1\nline 2",tag,"{""source"":""excel""}"',
      tableInfo: {
        sheetCount: 1,
        mergedCellCount: 0
      }
    });

    const rawText = await parseDatasetImportFile({
      ...defaultParams,
      filePath: '/tmp/template.xlsx',
      filename: 'template.xlsx'
    });

    expect(Papa.parse(rawText).data).toEqual([
      ['q', 'a', 'index', 'metadata'],
      ['question, one', 'line 1\nline 2', 'tag', '{"source":"excel"}']
    ]);
  });

  it('accepts legacy headers returned by the Excel worker', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a,indexes\nquestion,answer,tag',
      tableInfo: {
        sheetCount: 1,
        mergedCellCount: 0
      }
    });

    await expect(
      parseDatasetImportFile({
        ...defaultParams,
        filePath: '/tmp/backup.xlsx',
        filename: 'backup.xlsx'
      })
    ).resolves.toContain('indexes');
  });

  it('rejects unsupported extensions before reading the file', async () => {
    await expect(
      parseDatasetImportFile({
        ...defaultParams,
        filePath: '/tmp/template.xls',
        filename: 'template.xls'
      })
    ).rejects.toThrow('extension');

    expect(mockReadRawTextByLocalFile).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'malformed content',
      result: { rawText: 'q,a\n"question,answer' },
      error: 'content'
    },
    {
      name: 'invalid headers',
      result: { rawText: 'question,answer\nquestion,answer' },
      error: 'headers'
    },
    {
      name: 'empty content',
      result: { rawText: '' },
      error: 'content'
    }
  ])('rejects $name returned by the worker', async ({ result, error }) => {
    mockReadRawTextByLocalFile.mockResolvedValue(result);

    await expect(parseDatasetImportFile(defaultParams)).rejects.toThrow(error);
  });

  it.each([
    {
      name: 'header-only export without trailing newline',
      rawText: '\uFEFFq,a',
      expectedRows: [['q', 'a']]
    },
    {
      name: 'header-only export with trailing newline',
      rawText: '\uFEFFq,a\r\n',
      expectedRows: [['q', 'a']]
    },
    {
      name: 'single-chunk export without trailing newline',
      rawText: '\uFEFFq,a\nQ1,A1',
      expectedRows: [
        ['q', 'a'],
        ['Q1', 'A1']
      ]
    },
    {
      name: 'single-chunk export with trailing newline',
      rawText: '\uFEFFq,a\r\nQ1,A1\r\n',
      expectedRows: [
        ['q', 'a'],
        ['Q1', 'A1']
      ]
    },
    {
      name: 'single-chunk export with multiple trailing blank lines',
      rawText: '\uFEFFq,a\r\nQ1,A1\r\n\r\n   \r\n',
      expectedRows: [
        ['q', 'a'],
        ['Q1', 'A1']
      ]
    }
  ])('normalizes $name', async ({ rawText, expectedRows }) => {
    mockReadRawTextByLocalFile.mockResolvedValue({ rawText });

    const normalizedCsv = await parseDatasetImportFile(defaultParams);

    expect(Papa.parse(normalizedCsv).data).toEqual(expectedRows);
  });

  it('drops fully blank records while preserving rows with either q or a', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a\r\n,\r\nQ1,\r\n,A1\r\n" "," "\r\n'
    });

    const normalizedCsv = await parseDatasetImportFile(defaultParams);

    expect(Papa.parse(normalizedCsv).data).toEqual([
      ['q', 'a'],
      ['Q1', ''],
      ['', 'A1']
    ]);
  });

  it('keeps delimiter auto-detection for typed semicolon-separated headers', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q;a\r\nQ1;A1\r\n'
    });

    const normalizedCsv = await parseDatasetImportFile(defaultParams);

    expect(Papa.parse(normalizedCsv).data).toEqual([
      ['q', 'a'],
      ['Q1', 'A1']
    ]);
  });

  it('accepts a header-only Excel result with trailing blank rows', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a\r\n\r\n',
      tableInfo: {
        sheetCount: 1,
        mergedCellCount: 0
      }
    });

    const normalizedCsv = await parseDatasetImportFile({
      ...defaultParams,
      filePath: '/tmp/empty-backup.xlsx',
      filename: 'empty-backup.xlsx'
    });

    expect(Papa.parse(normalizedCsv).data).toEqual([['q', 'a']]);
  });

  it('still rejects malformed quoted content when trailing blank lines are present', async () => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a\r\n"question,answer\r\n\r\n'
    });

    await expect(parseDatasetImportFile(defaultParams)).rejects.toThrow('content');
  });

  it.each([
    {
      name: 'missing table information',
      tableInfo: undefined,
      error: 'exactly one worksheet'
    },
    {
      name: 'multiple worksheets',
      tableInfo: { sheetCount: 2, mergedCellCount: 0 },
      error: 'exactly one worksheet'
    },
    {
      name: 'merged cells',
      tableInfo: { sheetCount: 1, mergedCellCount: 1 },
      error: 'merged cells'
    }
  ])('rejects Excel with $name', async ({ tableInfo, error }) => {
    mockReadRawTextByLocalFile.mockResolvedValue({
      rawText: 'q,a\nquestion,answer',
      tableInfo
    });

    await expect(
      parseDatasetImportFile({
        ...defaultParams,
        filePath: '/tmp/template.xlsx',
        filename: 'template.xlsx'
      })
    ).rejects.toThrow(error);
  });
});
