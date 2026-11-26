import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { connectionMongo } from '../../../../common/mongo';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';

describe('system configuration database consistency', () => {
  let connection: ReturnType<typeof connectionMongo.createConnection>;

  beforeAll(async () => {
    // 使用同一个隔离测试库，以真实的连接级副本偏好验证模型可以覆盖它。
    connection = await connectionMongo
      .createConnection(inject('MONGODB_URI'), {
        readPreference: 'secondaryPreferred',
        autoCreate: false,
        autoIndex: false
      })
      .asPromise();
  });

  afterAll(async () => {
    await connection?.close();
  });

  it.each([
    {
      name: 'legacy system settings',
      originalModel: MongoSystemConfigs,
      document: { type: SystemConfigsTypeEnum.fastgpt, value: { feConfigs: {} } }
    },
    {
      name: 'instance settings',
      originalModel: MongoSystemInstanceConfig,
      document: { domain: 'site', overrides: { name: 'Primary config' } }
    }
  ])(
    'reads $name from primary and acknowledges writes with majority',
    async ({ originalModel, document }) => {
      expect(connection.getClient().readPreference.mode).toBe('secondaryPreferred');
      const model = connection.model(
        originalModel.modelName,
        originalModel.schema,
        originalModel.collection.name
      );
      const find = vi.spyOn(model.collection, 'find');
      const findOne = vi.spyOn(model.collection, 'findOne');
      const aggregate = vi.spyOn(model.collection, 'aggregate');
      const insertOne = vi.spyOn(model.collection, 'insertOne');

      try {
        await model.create(document);
        expect(insertOne.mock.calls[0]?.[1]?.writeConcern).toMatchObject({ w: 'majority' });
        expect(await model.find({}).lean()).toHaveLength(1);
        expect(await model.findOne({}).lean()).not.toBeNull();
        expect(await model.aggregate([{ $match: {} }])).toHaveLength(1);

        for (const read of [find, findOne, aggregate]) {
          const preference = read.mock.calls[0]?.[1]?.readPreference;
          expect(typeof preference === 'string' ? preference : preference?.mode).toBe('primary');
        }
      } finally {
        find.mockRestore();
        findOne.mockRestore();
        aggregate.mockRestore();
        insertOne.mockRestore();
      }
    }
  );
});
