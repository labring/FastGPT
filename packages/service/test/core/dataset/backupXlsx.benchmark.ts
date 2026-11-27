import { deepStrictEqual } from 'node:assert/strict';
import { expect, it } from 'vitest';
import { backupXlsxLayouts, createBackupXlsxFixture } from './backupXlsx.fixture';

const rowCount = 50_000;

it.each(backupXlsxLayouts)(
  'restores 50,000 data rows with a 20-column header under default limits (%s)',
  async (layout) => {
    const { restore, expectedChunk } = await createBackupXlsxFixture(layout, rowCount);
    const chunks = await restore();

    expect(chunks).toHaveLength(rowCount);
    for (const [index, { q, a, indexes, metadata }] of chunks.entries()) {
      deepStrictEqual({ q, a, indexes, metadata }, expectedChunk(index + 1));
    }
  },
  300_000
);
