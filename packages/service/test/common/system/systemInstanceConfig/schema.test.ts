import { describe, expect, it } from 'vitest';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';

describe('MongoSystemInstanceConfig schema', () => {
  it('uses the system instance config collection', () => {
    expect(MongoSystemInstanceConfig.collection.name).toBe('system_instance_configs');
  });

  it('uses a fixed instance document without namespace or overrides', () => {
    expect(MongoSystemInstanceConfig.schema.path('_id')?.options.immutable).toBe(true);
    expect(MongoSystemInstanceConfig.schema.path('namespace')).toBeUndefined();
    expect(MongoSystemInstanceConfig.schema.path('overrides')).toBeUndefined();
    expect(MongoSystemInstanceConfig.schema.path('secretOverrides')).toBeUndefined();
  });

  it('validates the complete config payload through the shared Zod schema', () => {
    const document = new MongoSystemInstanceConfig({
      config: {
        site: {
          name: 'FastGPT'
        }
      }
    });

    expect(document.validateSync()).toBeUndefined();
  });

  it('rejects an invalid config payload', () => {
    const document = new MongoSystemInstanceConfig({
      config: {
        performance: {
          workflow: {
            maxLoopTimes: 10,
            parallelMaxConcurrency: 11
          }
        }
      }
    });

    expect(document.validateSync()?.errors.config).toBeDefined();
  });

  it('rejects a document with a non-instance identifier', () => {
    const document = new MongoSystemInstanceConfig({
      _id: 'another-instance',
      config: {}
    });

    expect(document.validateSync()?.errors._id).toBeDefined();
  });
});
