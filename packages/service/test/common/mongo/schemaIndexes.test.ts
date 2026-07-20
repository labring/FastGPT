import { describe, expect, it } from 'vitest';
import { Schema } from '@fastgpt/service/common/mongo';
import {
  getDeprecatedIndexes,
  defineDeprecatedIndexes
} from '@fastgpt/service/common/mongo/schemaIndexes';

describe('Schema deprecated MongoDB indexes', () => {
  it('returns an empty list for a Schema without declarations', () => {
    expect(getDeprecatedIndexes(new Schema())).toEqual([]);
  });

  it('stores declarations on the Schema and appends later declarations', () => {
    const schema = new Schema();
    defineDeprecatedIndexes(schema, [
      {
        indexName: 'legacy_a_1',
        key: { legacyA: 1 }
      }
    ]);
    defineDeprecatedIndexes(schema, [
      {
        indexName: 'legacy_b_1',
        key: { legacyB: 1 }
      }
    ]);

    expect(getDeprecatedIndexes(schema).map((index) => index.indexName)).toEqual([
      'legacy_a_1',
      'legacy_b_1'
    ]);
  });

  it('rejects duplicate index names within one Schema', () => {
    const schema = new Schema();
    const definition = {
      indexName: 'legacy_1',
      key: { legacy: 1 }
    } as const;
    defineDeprecatedIndexes(schema, [definition]);

    expect(() => defineDeprecatedIndexes(schema, [definition])).toThrow(
      'Duplicate deprecated MongoDB index declaration: legacy_1'
    );
  });
});
