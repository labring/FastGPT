// src/utils/json_parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseJSON } from '../src/utils/json_parser';

describe('json_parser', () => {
  describe('parseJSON', () => {
    it('should parse JSON objects', () => {
      const result = parseJSON<{ name: string }>('{"name": "test"}');
      expect(result).toEqual({ name: 'test' });
    });
  });
});
