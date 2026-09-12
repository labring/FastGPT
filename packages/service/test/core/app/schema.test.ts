import { describe, expect, it } from 'vitest';
import { MongoApp } from '../../../core/app/schema';

describe('app schema', () => {
  it('should persist entry point configuration as an array', () => {
    expect(MongoApp.schema.path('chatConfig.entryPoints')?.instance).toBe('Array');
  });
});
