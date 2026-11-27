import { expect, it } from 'vitest';
import { XLSX_PARSE_LIMITS } from '@fastgpt/service/worker/readFile/extension/xlsx';
import { backupXlsxLayouts, createBackupXlsxFixture } from './backupXlsx.fixture';

const rowCount = 4;

it.each(backupXlsxLayouts)(
  'restores at the data cell limit and rejects one cell over it (%s)',
  async (layout) => {
    const { restore, expectedChunk, columnCount, dataCellCount } = await createBackupXlsxFixture(
      layout,
      rowCount
    );
    const previousLimits = { ...XLSX_PARSE_LIMITS };

    try {
      // 行列上限包含表头，单元格上限只计非空数据。稀疏场景只有问答和最后一行的元数据。
      Object.assign(XLSX_PARSE_LIMITS, {
        maxRows: rowCount + 1,
        maxColumns: columnCount,
        maxCells: dataCellCount
      });
      expect(await restore()).toEqual(
        Array.from({ length: rowCount }, (_, index) => expectedChunk(index + 1))
      );

      Object.assign(XLSX_PARSE_LIMITS, { maxCells: dataCellCount - 1 });
      await expect(restore()).rejects.toThrow(
        `XLSX workbook exceeds the maximum data cell limit of ${dataCellCount - 1}`
      );
    } finally {
      Object.assign(XLSX_PARSE_LIMITS, previousLimits);
    }
  }
);
