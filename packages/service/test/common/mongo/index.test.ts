import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getMongoModel, Schema, Types } from '@fastgpt/service/common/mongo';

type TestMongoRecord = {
  ownerId: Types.ObjectId;
};

const getFindHooks = (schema: InstanceType<typeof Schema>, type: '_pres' | '_posts') =>
  ((schema as any).s.hooks[type].get('find') ?? []) as Array<{ fn: (...args: any[]) => unknown }>;

describe('Mongo common middleware', () => {
  it('installs common middleware only once for a reused Schema', () => {
    const schema = new Schema<TestMongoRecord>({
      ownerId: Schema.Types.ObjectId
    });

    getMongoModel<TestMongoRecord>(`MongoMiddlewareFirst${randomUUID()}`, schema);
    getMongoModel<TestMongoRecord>(`MongoMiddlewareSecond${randomUUID()}`, schema);

    expect(getFindHooks(schema, '_pres')).toHaveLength(1);
    // One slow-query post hook plus one ObjectId conversion post hook.
    expect(getFindHooks(schema, '_posts')).toHaveLength(2);
  });

  it('converts ObjectIds in lean query results through middleware', async () => {
    const schema = new Schema<TestMongoRecord>({
      ownerId: Schema.Types.ObjectId
    });
    const model = getMongoModel<TestMongoRecord>(`MongoMiddlewareResult${randomUUID()}`, schema);
    const ownerId = new Types.ObjectId();

    await model.create({ ownerId });

    const result = await model.findOne({ ownerId }).lean();

    expect(result).not.toBeNull();
    expect(result?._id).toEqual(expect.any(String));
    expect(result?.ownerId).toBe(ownerId.toString());
  });
});
