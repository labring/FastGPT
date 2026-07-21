import { describe, expect, it } from 'vitest';
import {
  asRedisLogicalKey,
  createChildRedisScanPattern,
  createRedisLogicalKey,
  FASTGPT_REDIS_PREFIX,
  toLogicalRedisKey,
  toPhysicalRedisKey
} from '@fastgpt/service/common/redis/runtime/keyspace';

describe('Redis keyspace', () => {
  it('builds versioned logical keys and encodes segments', () => {
    const key = createRedisLogicalKey({
      namespace: 'chat:resume',
      version: 2,
      segments: ['team/1', 'chat:2', "a*b!c(d)'e", 0]
    });

    expect(key).toBe('chat:resume:v2:team%2F1:chat%3A2:a%2Ab%21c%28d%29%27e:0');
    expect(toPhysicalRedisKey(key)).toBe(`${FASTGPT_REDIS_PREFIX}${key}`);
    expect(createRedisLogicalKey({ namespace: 'cache' })).toBe('cache');
  });

  it('preserves legacy logical keys and only strips a leading physical prefix', () => {
    const logical = asRedisLogicalKey('session:user:fastgpt:value');
    const physical = toPhysicalRedisKey(logical);

    expect(toLogicalRedisKey(physical)).toBe(logical);
    expect(toLogicalRedisKey(`${FASTGPT_REDIS_PREFIX}session:fastgpt:value`)).toBe(
      'session:fastgpt:value'
    );
  });

  it('builds child scan patterns in the physical keyspace', () => {
    expect(createChildRedisScanPattern('VERSION_KEY:model')).toBe('fastgpt:VERSION_KEY:model:*');
    expect(createChildRedisScanPattern('VERSION_KEY:a*b?[c]\\d')).toBe(
      'fastgpt:VERSION_KEY:a\\*b\\?\\[c\\]\\\\d:*'
    );
  });

  it.each([
    () => createRedisLogicalKey({ namespace: '' }),
    () => createRedisLogicalKey({ namespace: 'chat space' }),
    () => createRedisLogicalKey({ namespace: 'chat', version: 0 }),
    () => createRedisLogicalKey({ namespace: 'chat', version: 1.2 }),
    () => createRedisLogicalKey({ namespace: 'chat', segments: [''] }),
    () => toPhysicalRedisKey(''),
    () => toPhysicalRedisKey('fastgpt:already-physical'),
    () => toLogicalRedisKey('other:key')
  ])('rejects unsafe key input', (createKey) => {
    expect(createKey).toThrow();
  });
});
