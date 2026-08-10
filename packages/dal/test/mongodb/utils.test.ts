import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { toEntityId, toMongoObjectId } from '../../mongodb/utils';
import { MongoInvalidArgumentError } from '../../mongodb/errors';

describe('toEntityId', () => {
  it('converts ObjectId and preserves string ids', () => {
    expect(toEntityId(new Types.ObjectId('507f1f77bcf86cd799439011'))).toBe(
      '507f1f77bcf86cd799439011'
    );
    expect(toEntityId('sql-id')).toBe('sql-id');
  });

  it('rejects unsupported values', () => {
    expect(() => toEntityId(1)).toThrow("mapping id value error: invalid 'id' value type");
  });
});

describe('toMongoObjectId', () => {
  it('converts a valid entity id', () => {
    expect(toMongoObjectId('507f1f77bcf86cd799439011')).toEqual(
      new Types.ObjectId('507f1f77bcf86cd799439011')
    );
  });

  it('rejects a non-Mongo entity id', () => {
    expect(() => toMongoObjectId('sql-id')).toThrow(MongoInvalidArgumentError);
    expect(() => toMongoObjectId('sql-id')).toThrow('Invalid MongoDB entity id');
  });
});
