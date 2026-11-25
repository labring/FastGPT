import { describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { createEntityId, EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import { optionalNullToUndefined } from '@fastgpt/global/common/zod';
import { DbRecordCorruptedError } from '@fastgpt/dal/db/errors';
import { parseRepoRow, parseRepoRows } from '@fastgpt/dal/db/parse';

const SampleReadSchema = z.object({
  _id: EntityIdSchema,
  name: z.string().min(1),
  ancestorIds: optionalNullToUndefined(z.array(EntityIdSchema)),
  publishedVersionId: optionalNullToUndefined(EntityIdSchema)
});

describe('@fastgpt/dal/db row parsers', () => {
  it('normalizes nested BSON ObjectId values, strips __v, and aligns PG null with Mongo undefined', () => {
    const id = createEntityId();
    const ancestorId = createEntityId();

    const mongoDoc = {
      _id: { toString: () => id },
      name: 'Agent A',
      ancestorIds: [{ toString: () => ancestorId }],
      __v: 3
    };
    const pgRow = {
      _id: id,
      name: 'Agent A',
      ancestorIds: [ancestorId],
      publishedVersionId: null
    };

    const parsedMongo = parseRepoRow({ table: 'apps', schema: SampleReadSchema, row: mongoDoc });
    const parsedPg = parseRepoRow({ table: 'apps', schema: SampleReadSchema, row: pgRow });

    expect(parsedMongo).toEqual(parsedPg);
    expect(parsedMongo).toEqual({
      _id: id,
      name: 'Agent A',
      ancestorIds: [ancestorId],
      publishedVersionId: undefined
    });
    expect('__v' in parsedMongo).toBe(false);
  });

  it('fails fast with DbRecordCorruptedError when a single row fails validation', () => {
    const logger = { error: vi.fn() };
    const badId = createEntityId();

    expect(() =>
      parseRepoRow({
        table: 'apps',
        schema: SampleReadSchema,
        row: { _id: badId, name: '' },
        logger
      })
    ).toThrow(DbRecordCorruptedError);

    expect(logger.error).toHaveBeenCalledWith(
      'Repository single row failed schema validation',
      expect.objectContaining({
        table: 'apps',
        recordId: badId
      })
    );
  });

  it('isolates and skips corrupted legacy rows in parseRepoRows (Warn & Skip) while returning valid rows', () => {
    const logger = { error: vi.fn() };
    const validId1 = createEntityId();
    const corruptedId = createEntityId();
    const validId2 = createEntityId();

    const rows = [
      { _id: validId1, name: 'Valid 1' },
      { _id: corruptedId, name: '' }, // Legacy corrupted row
      { _id: validId2, name: 'Valid 2' }
    ];

    const result = parseRepoRows({
      table: 'apps',
      schema: SampleReadSchema,
      rows,
      logger
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item._id)).toEqual([validId1, validId2]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Repository row failed schema validation, skipping corrupted record',
      expect.objectContaining({
        table: 'apps',
        recordId: corruptedId
      })
    );
  });
});
