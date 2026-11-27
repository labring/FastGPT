import { PassThrough } from 'node:stream';
import { buffer as readBuffer } from 'node:stream/consumers';
import { expect, it } from 'vitest';
import { writeXlsx } from '@fastgpt/global/common/file/xlsx/write-xlsx';
import { parseDatasetBackupRows } from '@fastgpt/service/core/dataset/read';
import {
  readXlsxRawText,
  XLSX_PARSE_LIMITS
} from '@fastgpt/service/worker/readFile/extension/xlsx';

it.each(['sparse', 'legacy explicit blanks', 'dense'] as const)(
  'restores 50,000 data rows with a 20-column header (%s)',
  async (layout) => {
    const dense = layout === 'dense';
    const indexes = Array.from({ length: 17 }, (_, index) => `Index ${index + 1}`);
    const destination = new PassThrough();
    const [, buffer] = await Promise.all([
      writeXlsx({
        sheets: [
          {
            name: 'Dataset',
            omitEmptyCells: layout !== 'legacy explicit blanks',
            *rows() {
              yield ['q', 'a', ...indexes.map(() => 'index'), 'metadata'];
              for (let index = 1; index <= 50_000; index += 1) {
                yield [
                  `Question ${index}`,
                  `Answer ${index}`,
                  ...indexes.map((value) => (dense ? value : '')),
                  dense || index === 50_000 ? JSON.stringify({ index }) : ''
                ];
              }
            }
          }
        ],
        destination
      }),
      readBuffer(destination)
    ]);

    const previousMaxCells = XLSX_PARSE_LIMITS.maxCells;
    // 稀疏样本只给 100,001 个数据格额度，全填满的样本用 1,000,000 格，各加实际的 20 格表头。
    Object.assign(XLSX_PARSE_LIMITS, { maxCells: dense ? 1_000_000 : 100_001 });
    try {
      const { xlsxRows = [] } = await readXlsxRawText(
        { extension: 'xlsx', buffer, encoding: 'utf-8' },
        { sparseRows: true }
      );
      const chunks = parseDatasetBackupRows({ rows: xlsxRows });
      expect(chunks).toHaveLength(50_000);
      expect(
        chunks.every(
          ({ q, a, indexes: restoredIndexes, metadata }, index) =>
            q === `Question ${index + 1}` &&
            a === `Answer ${index + 1}` &&
            restoredIndexes.length === (dense ? 17 : 0) &&
            restoredIndexes.every((value, column) => value === indexes[column]) &&
            metadata?.index === (dense || index === 49_999 ? index + 1 : undefined)
        )
      ).toBe(true);
    } finally {
      Object.assign(XLSX_PARSE_LIMITS, { maxCells: previousMaxCells });
    }
  },
  120_000
);
