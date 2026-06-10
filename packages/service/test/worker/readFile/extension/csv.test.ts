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
});
