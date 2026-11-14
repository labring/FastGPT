import { describe, expect, it } from 'vitest';
import {
  createChangedResult,
  createDryRunResult,
  createSuccessResult
} from '../../src/shared/result';

describe('Result Builders (src/shared/result.ts)', () => {
  it('creates success result with changed: false', () => {
    const res = createSuccessResult({
      data: { count: 5 },
      message: 'Found items',
      meta: { total: 5 },
      warnings: ['warn-1']
    });

    expect(res).toEqual({
      changed: false,
      data: { count: 5 },
      message: 'Found items',
      meta: { total: 5 },
      warnings: ['warn-1']
    });
  });

  it('creates changed result with changed: true', () => {
    const res = createChangedResult({
      data: { id: '123' },
      message: 'Created'
    });

    expect(res).toEqual({
      changed: true,
      data: { id: '123' },
      message: 'Created'
    });
  });

  it('creates dry-run result with dryRun: true in data and changed: false', () => {
    const res = createDryRunResult({
      operation: 'dataset delete',
      preview: { datasetId: 'd-1', willDeleteCollections: 3 }
    });

    expect(res.changed).toBe(false);
    expect(res.data).toEqual({
      dryRun: true,
      operation: 'dataset delete',
      datasetId: 'd-1',
      willDeleteCollections: 3
    });
    expect(res.message).toContain('Preview for operation "dataset delete"');
  });
});
