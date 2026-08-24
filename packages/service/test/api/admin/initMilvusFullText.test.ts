import { describe, expect, it } from 'vitest';
import { parseQuery } from '@/pages/api/admin/initMilvusFullText';

describe('initMilvusFullText query parsing', () => {
  it('TC-16.1 parses boolean string params', () => {
    expect(parseQuery({ batchSize: '500', dryRun: '1', removeOld: 'true' })).toEqual({
      batchSize: 500,
      dryRun: true,
      removeOld: true,
      resumeMigrationId: undefined
    });
  });

  it('TC-16.2 parses resumeMigrationId', () => {
    expect(parseQuery({ resumeMigrationId: 'm1' })).toEqual({
      batchSize: undefined,
      dryRun: false,
      removeOld: false,
      resumeMigrationId: 'm1'
    });
  });
});
