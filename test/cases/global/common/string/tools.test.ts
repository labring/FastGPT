import { describe, expect, it } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';

describe('hashStr', () => {
  test('should return a valid SHA-256 hash', () => {
    const input = 'Test#135';
    const result = hashStr(hashStr(input));
    console.log(input + ': ' + result);
    // 验证结果是否为一个有效的 SHA-256 哈希值
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64); // SHA-256 哈希值的长度为 64 个字符
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });
});
