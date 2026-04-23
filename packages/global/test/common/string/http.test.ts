import { describe, expect, it } from 'vitest';
import { parseCurl } from '@fastgpt/global/common/string/http';

describe('http parseCurl', () => {
  it('should parse simple GET request', () => {
    const curl = `curl 'https://example.com/api/users'`;
    const result = parseCurl(curl);

    expect(result.url).toBe('https://example.com/api/users');
    expect(result.method).toBe('GET');
    expect(result.params).toEqual([]);
    expect(result.headers).toEqual([]);
    expect(result.body).toBe(undefined);
    expect(result.bodyArray).toEqual([]);
  });

  it('should parse GET request with query parameters', () => {
    const curl = `curl 'https://example.com/api/users?page=1&limit=10'`;
    const result = parseCurl(curl);

    expect(result.url).toBe('https://example.com/api/users');
    expect(result.method).toBe('GET');
    expect(result.params).toEqual([
      { key: 'page', value: '1', type: 'string' },
      { key: 'limit', value: '10', type: 'string' }
    ]);
  });

  it('should parse POST request with JSON body', () => {
    const curl = `curl -X POST 'https://example.com/api/users' -H 'Content-Type: application/json' -d '{"name":"John","age":30}'`;
    const result = parseCurl(curl);

    expect(result.url).toBe('https://example.com/api/users');
    expect(result.method).toBe('POST');
    expect(result.headers).toContainEqual({
      key: 'Content-Type',
      value: 'application/json',
      type: 'string'
    });
    expect(result.body).toBe('{\n  "name": "John",\n  "age": 30\n}');
    expect(result.bodyArray).toEqual([
      { key: 'name', value: 'John', type: 'string' },
      { key: 'age', value: 30, type: 'string' }
    ]);
  });

  it('should parse PUT request', () => {
    const curl = `curl -X PUT 'https://example.com/api/users/123' -d '{"status":"active"}'`;
    const result = parseCurl(curl);

    expect(result.url).toBe('https://example.com/api/users/123');
    expect(result.method).toBe('PUT');
    expect(result.bodyArray).toEqual([{ key: 'status', value: 'active', type: 'string' }]);
  });

  it('should parse DELETE request', () => {
    const curl = `curl -X DELETE 'https://example.com/api/users/123'`;
    const result = parseCurl(curl);

    expect(result.url).toBe('https://example.com/api/users/123');
    expect(result.method).toBe('DELETE');
  });

  it('should parse PATCH request', () => {
    const curl = `curl -X PATCH 'https://example.com/api/users/123' -d '{"email":"new@example.com"}'`;
    const result = parseCurl(curl);

    expect(result.url).toBe('https://example.com/api/users/123');
    expect(result.method).toBe('PATCH');
  });

  it('should parse request with multiple headers', () => {
    const curl = `curl 'https://example.com/api/data' -H 'Authorization: Bearer token123' -H 'Accept: application/json' -H 'User-Agent: TestClient'`;
    const result = parseCurl(curl);

    expect(result.headers).toContainEqual({
      key: 'Authorization',
      value: 'Bearer token123',
      type: 'string'
    });
    expect(result.headers).toContainEqual({
      key: 'Accept',
      value: 'application/json',
      type: 'string'
    });
    expect(result.headers).toContainEqual({
      key: 'User-Agent',
      value: 'TestClient',
      type: 'string'
    });
  });

  it('should parse request with complex JSON body', () => {
    const curl = `curl -X POST 'https://example.com/api/order' -d '{"items":[{"id":1,"qty":2}],"total":100}'`;
    const result = parseCurl(curl);

    expect(result.bodyArray).toContainEqual({
      key: 'items',
      value: [{ id: 1, qty: 2 }],
      type: 'string'
    });
    expect(result.bodyArray).toContainEqual({ key: 'total', value: 100, type: 'string' });
  });

  it('should default to GET method when method is not specified', () => {
    const curl = `curl 'https://example.com/api/users'`;
    const result = parseCurl(curl);

    expect(result.method).toBe('GET');
  });

  it('should handle lowercase method names', () => {
    const curl = `curl -X post 'https://example.com/api/users'`;
    const result = parseCurl(curl);

    expect(result.method).toBe('POST');
  });

  it('should throw error when url is missing', () => {
    const curl = `curl -X POST -d '{"data":"test"}'`;

    expect(() => parseCurl(curl)).toThrow('url not found');
  });

  it('should parse empty body as undefined', () => {
    const curl = `curl -X POST 'https://example.com/api/submit'`;
    const result = parseCurl(curl);

    expect(result.body).toBe(undefined);
    expect(result.bodyArray).toEqual([]);
  });

  it('should handle request with both params and body', () => {
    const curl = `curl -X POST 'https://example.com/api/search?type=user&active=true' -d '{"query":"test"}'`;
    const result = parseCurl(curl);

    expect(result.params).toEqual([
      { key: 'type', value: 'user', type: 'string' },
      { key: 'active', value: 'true', type: 'string' }
    ]);
    expect(result.bodyArray).toEqual([{ key: 'query', value: 'test', type: 'string' }]);
  });
});
