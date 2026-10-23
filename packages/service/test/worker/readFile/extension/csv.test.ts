import { describe, expect, it } from 'vitest';
import { readCsvRawText } from '@fastgpt/service/worker/readFile/extension/csv';

describe('readCsvRawText', () => {
  it('should keep raw text and remove empty rows and columns from format text', async () => {
    const rawText = [
      ',"name|alias",,note,',
      ',"Alice|A",,"line1\nline2",',
      ',,,,',
      ',Bob,,normal,'
    ].join('\n');

    const result = await readCsvRawText({
      extension: 'csv',
      buffer: Buffer.from(rawText, 'utf-8'),
      encoding: 'utf-8'
    });

    expect(result.rawText).toBe(rawText);
    expect(result.formatText).toBe(`| name\\|alias | note |
| --- | --- |
| Alice\\|A | line1\\nline2 |
| Bob | normal |`);
  });

  it('detects a semicolon delimiter when a short CSV contains a blank line', async () => {
    const result = await readCsvRawText({
      extension: 'csv',
      buffer: Buffer.from('q;a\n\nQ1;A1', 'utf-8'),
      encoding: 'utf-8'
    });

    expect(result.formatText).toBe(`| q | a |
| --- | --- |
| Q1 | A1 |`);
  });

  it('formats a CSV with more rows than the function argument limit', async () => {
    const rowCount = 150_000;
    const rawText = [
      'id,,note',
      ...Array.from({ length: rowCount }, (_, index) => `${index},,value`)
    ].join('\n');

    const result = await readCsvRawText({
      extension: 'csv',
      buffer: Buffer.from(rawText, 'utf-8'),
      encoding: 'utf-8'
    });

    const lines = result.formatText?.split('\n');
    expect(result.rawText).toBe(rawText);
    expect(lines).toHaveLength(rowCount + 2);
    expect(lines?.slice(0, 3)).toEqual(['| id | note |', '| --- | --- |', '| 0 | value |']);
    expect(lines?.at(-1)).toBe(`| ${rowCount - 1} | value |`);
  });
});
