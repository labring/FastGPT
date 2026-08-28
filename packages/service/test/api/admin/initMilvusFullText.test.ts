import { describe, expect, it } from 'vitest';
import { QuerySchema } from '@/pages/api/admin/initMilvusFullText';

// Fix 5:parseQuery 换成 zod QuerySchema + parseApiInput(接口边界统一校验)。
// 直接测 QuerySchema:coerce 数值/布尔字符串、resumeMigrationId 必须是 uuid、非法 batchSize 拒绝。
describe('initMilvusFullText query parsing', () => {
  it('TC-16.1 coerces boolean/number string params with defaults', () => {
    expect(QuerySchema.parse({ batchSize: '500', dryRun: '1', removeOld: 'true' })).toEqual({
      batchSize: 500,
      dryRun: true,
      removeOld: true,
      resumeMigrationId: undefined
    });
  });

  it('TC-16.2 parses resumeMigrationId as uuid', () => {
    expect(
      QuerySchema.parse({ resumeMigrationId: '550e8400-e29b-41d4-a716-446655440000' })
    ).toEqual({
      batchSize: 500,
      dryRun: false,
      removeOld: false,
      resumeMigrationId: '550e8400-e29b-41d4-a716-446655440000'
    });
  });

  it('TC-16.3 rejects illegal batchSize instead of propagating NaN', () => {
    expect(() => QuerySchema.parse({ batchSize: 'abc' })).toThrow();
    expect(() => QuerySchema.parse({ batchSize: 0 })).toThrow();
  });
});
