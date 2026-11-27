import { beforeEach, describe, expect, it, vi } from 'vitest';
import Papa from 'papaparse';

const { mockReadFileContentBySource, mockReadRawContentFromSource } = vi.hoisted(() => ({
  mockReadFileContentBySource: vi.fn(),
  mockReadRawContentFromSource: vi.fn()
}));

vi.mock('@fastgpt/service/common/file/read/utils', () => ({
  readFileContentBySource: mockReadFileContentBySource
}));

vi.mock('@fastgpt/service/worker/function', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/worker/function')>()),
  readRawContentFromSource: mockReadRawContentFromSource
}));

import { parseDatasetImportFile } from '@fastgpt/service/core/dataset/importFile';

const defaultParams = {
  teamId: 'team-id',
  tmbId: 'tmb-id',
  filename: 'template.csv',
  source: {
    kind: 's3' as const,
    sizeBytes: 10,
    metadata: { filename: 'template.csv' },
    materialize: vi.fn()
  }
};

describe('parseDatasetImportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid CSV content from the system readFile worker', async () => {
    mockReadFileContentBySource.mockResolvedValue({
      rawText: 'q,a,index,metadata\n"question, one","line 1\nline 2",tag,"{""rank"":1}"'
    });

    const { rawText } = await parseDatasetImportFile({
      ...defaultParams,
      filename: 'template.CSV'
    });

    expect(mockReadFileContentBySource).toHaveBeenCalledWith({
      teamId: defaultParams.teamId,
      tmbId: defaultParams.tmbId,
      source: defaultParams.source,
      getFormatText: false,
      forceSystemParse: true
    });
    expect(Papa.parse(rawText ?? '').data).toEqual([
      ['q', 'a', 'index', 'metadata'],
      ['question, one', 'line 1\nline 2', 'tag', '{"rank":1}']
    ]);
  });

  it('restores sparse indexes and metadata using the actual header coordinates', async () => {
    mockReadRawContentFromSource.mockResolvedValueOnce({
      xlsxRows: [
        new Map([
          [0, 'q'],
          [1, 'a'],
          [4, 'index'],
          [17, 'index'],
          [19, 'metadata']
        ]),
        new Map([
          [0, 'question, one'],
          [1, 'line 1\nline 2'],
          [17, 'second'],
          [4, 'first'],
          [19, '{"source":"excel"}']
        ])
      ]
    });

    const result = await parseDatasetImportFile({ ...defaultParams, filename: 'template.xlsx' });
    expect(mockReadRawContentFromSource).toHaveBeenCalledWith({
      source: defaultParams.source,
      sparseXlsxRows: true
    });
    expect(result.importedTable?.chunks).toEqual([
      {
        q: 'question, one',
        a: 'line 1\nline 2',
        indexes: ['first', 'second'],
        metadata: { source: 'excel' }
      }
    ]);
  });

  it('restores the trailing indexes in a legacy workbook', async () => {
    mockReadRawContentFromSource.mockResolvedValueOnce({
      xlsxRows: [
        new Map([
          [0, 'q'],
          [1, 'a'],
          [2, 'indexes']
        ]),
        new Map([
          [0, 'Question'],
          [1, 'Answer'],
          [2, 'first'],
          [7, 'last']
        ])
      ]
    });

    await expect(
      parseDatasetImportFile({ ...defaultParams, filename: 'backup.xlsx' })
    ).resolves.toMatchObject({ importedTable: { chunks: [{ indexes: ['first', 'last'] }] } });
  });

  it('rejects unsupported extensions before reading the file', async () => {
    await expect(
      parseDatasetImportFile({
        ...defaultParams,
        filename: 'template.xls'
      })
    ).rejects.toThrow('extension');

    expect(mockReadFileContentBySource).not.toHaveBeenCalled();
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
    mockReadFileContentBySource.mockResolvedValue(result);

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
    mockReadFileContentBySource.mockResolvedValue({ rawText });

    const { rawText: normalizedCsv } = await parseDatasetImportFile(defaultParams);

    expect(Papa.parse(normalizedCsv ?? '').data).toEqual(expectedRows);
  });

  it('drops fully blank records while preserving rows with either q or a', async () => {
    mockReadFileContentBySource.mockResolvedValue({
      rawText: 'q,a\r\n,\r\nQ1,\r\n,A1\r\n" "," "\r\n'
    });

    const { rawText: normalizedCsv } = await parseDatasetImportFile(defaultParams);

    expect(Papa.parse(normalizedCsv ?? '').data).toEqual([
      ['q', 'a'],
      ['Q1', ''],
      ['', 'A1']
    ]);
  });

  it('keeps delimiter auto-detection for typed semicolon-separated headers', async () => {
    mockReadFileContentBySource.mockResolvedValue({
      rawText: 'q;a\r\nQ1;A1\r\n'
    });

    const { rawText: normalizedCsv } = await parseDatasetImportFile(defaultParams);

    expect(Papa.parse(normalizedCsv ?? '').data).toEqual([
      ['q', 'a'],
      ['Q1', 'A1']
    ]);
  });

  it('accepts a header-only workbook', async () => {
    mockReadRawContentFromSource.mockResolvedValueOnce({
      xlsxRows: [
        new Map([
          [0, 'q'],
          [1, 'a']
        ])
      ]
    });

    await expect(
      parseDatasetImportFile({ ...defaultParams, filename: 'empty-backup.xlsx' })
    ).resolves.toEqual({ importedTable: { chunks: [], rawTextLength: 2 } });
  });

  it('still rejects malformed quoted content when trailing blank lines are present', async () => {
    mockReadFileContentBySource.mockResolvedValue({
      rawText: 'q,a\r\n"question,answer\r\n\r\n'
    });

    await expect(parseDatasetImportFile(defaultParams)).rejects.toThrow('content');
  });

  it('rejects a workbook without a structured result', async () => {
    mockReadRawContentFromSource.mockResolvedValueOnce({ rawText: 'q,a\nQuestion,Answer' });

    await expect(
      parseDatasetImportFile({ ...defaultParams, filename: 'backup.xlsx' })
    ).rejects.toThrow('Missing structured XLSX import result');
  });
});
