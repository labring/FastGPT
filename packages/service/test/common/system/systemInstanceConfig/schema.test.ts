import { describe, expect, it } from 'vitest';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';

describe('MongoSystemInstanceConfig schema', () => {
  it('uses the system instance config collection', () => {
    expect(MongoSystemInstanceConfig.collection.name).toBe('system_instance_configs');
  });

  it('uses domain-keyed documents with sparse overrides', () => {
    expect(MongoSystemInstanceConfig.schema.path('_id')?.options.immutable).toBe(true);
    expect(MongoSystemInstanceConfig.schema.path('overrides')).toBeDefined();
    expect(MongoSystemInstanceConfig.schema.path('revision')).toBeDefined();
  });

  it('validates a valid sparse overrides payload for a domain', () => {
    const document = new MongoSystemInstanceConfig({
      _id: 'site',
      overrides: {
        name: 'FastGPT'
      }
    });

    expect(document.validateSync()).toBeUndefined();
  });

  it('rejects overrides containing unknown fields for the domain', () => {
    const document = new MongoSystemInstanceConfig({
      _id: 'site',
      overrides: {
        unknownSiteField: 'invalid'
      }
    });

    expect(document.validateSync()?.errors.overrides).toBeDefined();
  });

  it('rejects overrides that violate cross-field constraints on effective config', () => {
    const document = new MongoSystemInstanceConfig({
      _id: 'performance',
      overrides: {
        workflow: {
          maxLoopTimes: 5 // parallelMaxConcurrency default is 10 > 5!
        }
      }
    });

    expect(document.validateSync()?.errors.overrides).toBeDefined();
  });

  it('rejects a document with a non-domain identifier', () => {
    const document = new MongoSystemInstanceConfig({
      _id: 'not-a-valid-domain',
      overrides: {}
    });

    expect(document.validateSync()?.errors._id).toBeDefined();
  });
});
