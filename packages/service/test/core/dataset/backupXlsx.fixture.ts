import { PassThrough } from 'node:stream';
import { buffer as readBuffer } from 'node:stream/consumers';
import { writeXlsx } from '@fastgpt/global/common/file/xlsx/write-xlsx';
import { parseDatasetBackupRows } from '@fastgpt/service/core/dataset/read';
import { readXlsxRawText } from '@fastgpt/service/worker/readFile/extension/xlsx';

export const backupXlsxLayouts = ['sparse', 'legacy explicit blanks', 'dense'] as const;

/** 用真实的 XLSX 写入和回导逻辑检验 20 列备份。 */
export const createBackupXlsxFixture = async (
  layout: (typeof backupXlsxLayouts)[number],
  rowCount: number
) => {
  const dense = layout === 'dense';
  const indexes = Array.from({ length: 17 }, (_, index) => `Index ${index + 1}`);
  const header = ['q', 'a', ...indexes.map(() => 'index'), 'metadata'];
  const rowIndexes = dense ? indexes : indexes.map(() => '');
  const expectedChunk = (index: number) => ({
    q: `Question ${index}`,
    a: `Answer ${index}`,
    indexes: dense ? indexes : [],
    metadata: dense || index === rowCount ? { index } : undefined
  });

  const destination = new PassThrough();
  const [buffer] = await Promise.all([
    readBuffer(destination),
    writeXlsx({
      sheets: [
        {
          name: 'Dataset',
          omitEmptyCells: layout !== 'legacy explicit blanks',
          *rows() {
            yield header;
            for (let index = 1; index <= rowCount; index += 1) {
              const { q, a, metadata } = expectedChunk(index);
              yield [q, a, ...rowIndexes, metadata ? JSON.stringify(metadata) : ''];
            }
          }
        }
      ],
      destination
    })
  ]);

  const restore = async () => {
    const { xlsxRows } = await readXlsxRawText(
      { extension: 'xlsx', buffer, encoding: 'utf-8' },
      { sparseRows: true }
    );
    if (!xlsxRows) throw new Error('Missing structured XLSX backup rows');
    return parseDatasetBackupRows({ rows: xlsxRows });
  };

  return {
    restore,
    expectedChunk,
    columnCount: header.length,
    dataCellCount: dense ? rowCount * header.length : rowCount * 2 + 1
  };
};
