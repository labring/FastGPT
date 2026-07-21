import { describe, expect, it } from 'vitest';
import {
  parseRedisConnectionConfig,
  RedisConfigurationError
} from '@fastgpt/service/common/redis/runtime/config';

describe('parseRedisConnectionConfig', () => {
  it('parses a TCP URL with credentials and database', () => {
    const result = parseRedisConnectionConfig(
      'redis://user%40name:pass%3Aword@redis.example:6380/2'
    );

    expect(result.options).toMatchObject({
      host: 'redis.example',
      port: 6380,
      username: 'user@name',
      password: 'pass:word',
      db: 2
    });
    expect(result.endpoint).toMatchObject({
      transport: 'tcp',
      host: 'redis.example',
      port: 6380,
      db: 2,
      tls: false,
      hasUsername: true,
      hasPassword: true
    });
  });

  it('supports an address without a protocol and rediss TLS', () => {
    const plain = parseRedisConnectionConfig('localhost:6379');
    const tls = parseRedisConnectionConfig('rediss://redis.example');

    expect(plain.options).toMatchObject({ host: 'localhost', port: 6379 });
    expect(plain.endpoint.tls).toBe(false);
    expect(tls.options).toMatchObject({ host: 'redis.example', port: 6379, tls: {} });
    expect(tls.endpoint.tls).toBe(true);
  });

  it('accepts the valid TCP port boundaries', () => {
    expect(parseRedisConnectionConfig('redis://redis.example:1').endpoint.port).toBe(1);
    expect(parseRedisConnectionConfig('redis://redis.example:65535').endpoint.port).toBe(65535);
  });

  it('normalizes an IPv6 host for ioredis TCP options', () => {
    const result = parseRedisConnectionConfig('redis://[::1]:6380/0');

    expect(result.options).toMatchObject({ host: '::1', port: 6380, db: 0 });
    expect(result.endpoint.host).toBe('::1');
  });

  it('supports Unix sockets without exposing a fake TCP endpoint', () => {
    const result = parseRedisConnectionConfig(' /var/run/redis/redis.sock ');

    expect(result.options).toEqual({ path: '/var/run/redis/redis.sock' });
    expect(result.endpoint).toMatchObject({
      transport: 'unix',
      path: '/var/run/redis/redis.sock',
      tls: false,
      hasUsername: false,
      hasPassword: false
    });
  });

  it.each([
    ['', 'REDIS_URL must not be empty'],
    ['http://redis.example', 'REDIS_URL protocol must be redis or rediss'],
    ['redis://redis.example/not-a-db', 'REDIS_URL database must be a non-negative integer'],
    [
      'redis://redis.example/999999999999999999999999',
      'REDIS_URL database is outside the supported integer range'
    ],
    [
      'redis://user%ZZ:password@redis.example',
      'REDIS_URL username is not valid percent-encoded text'
    ],
    [
      'redis://redis.example/1?tls=true',
      'REDIS_URL query parameters and fragments are not supported'
    ],
    [
      'redis://redis.example/1#fragment',
      'REDIS_URL query parameters and fragments are not supported'
    ],
    ['redis://redis.example/?', 'REDIS_URL query parameters and fragments are not supported'],
    ['redis://redis.example/#', 'REDIS_URL query parameters and fragments are not supported'],
    ['/var/run/redis.sock?tls=true', 'REDIS_URL query parameters and fragments are not supported'],
    ['/var/run/redis.sock#fragment', 'REDIS_URL query parameters and fragments are not supported'],
    ['redis://redis.example:0', 'REDIS_URL port must be between 1 and 65535'],
    ['redis://redis.example/%E0%A4%A', 'REDIS_URL database must be a non-negative integer']
  ])('rejects unsafe URL %s', (input, message) => {
    expect(() => parseRedisConnectionConfig(input)).toThrow(new RedisConfigurationError(message));
  });

  it('rejects a port above the URL parser boundary', () => {
    expect(() => parseRedisConnectionConfig('redis://redis.example:65536')).toThrow(
      RedisConfigurationError
    );
  });

  it('does not include the original URL in configuration errors', () => {
    const input = 'redis://user:secret@redis.example/not-a-db';

    try {
      parseRedisConnectionConfig(input);
      expect.fail('Expected REDIS_URL parsing to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RedisConfigurationError);
      expect((error as Error).message).not.toContain('secret');
    }
  });
});
