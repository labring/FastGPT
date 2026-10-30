import { describe, expect, it } from 'vitest';
import { MongoApp } from '../../../core/app/schema';
import { MongoAppVersion } from '../../../core/app/version/schema';

describe('app schema', () => {
  it('should persist entry point configuration as an array', () => {
    expect(MongoApp.schema.path('chatConfig.entryPoints')?.instance).toBe('Array');
  });

  it('stores reference snapshots on versions, not the legacy app document', () => {
    expect(MongoApp.schema.path('referenceSnapshots')).toBeUndefined();
    expect(MongoApp.schema.path('modules')?.instance).toBe('Array');
    expect(MongoApp.schema.path('resourceRefs')).toBeDefined();
    expect(MongoApp.schema.path('publishedVersionId')?.instance).toBe('ObjectId');

    expect(MongoAppVersion.schema.path('referenceSnapshots')?.instance).toBe('Array');
    expect(MongoAppVersion.schema.path('resources')?.instance).toBe('Array');
    expect(MongoAppVersion.schema.path('resourceRefs')).toBeDefined();
  });
});
