import { describe, expect, it } from 'vitest';
import { base64ToBytes, base64ToString, bytesToBase64, stringToBase64 } from '@/utils/base64';

describe('base64 utilities', () => {
  describe('bytesToBase64', () => {
    it('should encode empty bytes to empty string', () => {
      const bytes = new Uint8Array([]);
      expect(bytesToBase64(bytes)).toBe('');
    });

    it('should encode bytes to base64', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = bytesToBase64(bytes);
      expect(result).toBe('SGVsbG8=');
    });

    it('should handle binary data', () => {
      const bytes = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const result = bytesToBase64(bytes);
      expect(result).toBeTruthy();
      // Verify round-trip
      expect(base64ToBytes(result)).toEqual(bytes);
    });
  });

  describe('base64ToBytes', () => {
    it('should decode empty string to empty bytes', () => {
      const result = base64ToBytes('');
      expect(result).toEqual(new Uint8Array([]));
    });

    it('should decode base64 to bytes', () => {
      const result = base64ToBytes('SGVsbG8=');
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('should handle whitespace in base64 string', () => {
      const result = base64ToBytes('  SGVsbG8=  ');
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('should decode binary data', () => {
      const original = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const encoded = bytesToBase64(original);
      const decoded = base64ToBytes(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe('stringToBase64', () => {
    it('should encode empty string', () => {
      expect(stringToBase64('')).toBe('');
    });

    it('should encode ASCII string to base64', () => {
      expect(stringToBase64('Hello')).toBe('SGVsbG8=');
    });

    it('should encode string with special characters', () => {
      const result = stringToBase64('Hello World!');
      expect(result).toBeTruthy();
      expect(base64ToString(result)).toBe('Hello World!');
    });

    it('should handle single character', () => {
      const result = stringToBase64('A');
      expect(result).toBe('QQ==');
    });
  });

  describe('base64ToString', () => {
    it('should decode empty base64 to empty string', () => {
      expect(base64ToString('')).toBe('');
    });

    it('should decode base64 to string', () => {
      expect(base64ToString('SGVsbG8=')).toBe('Hello');
    });

    it('should handle whitespace in input', () => {
      expect(base64ToString('  SGVsbG8=  ')).toBe('Hello');
    });

    it('should round-trip with stringToBase64', () => {
      const original = 'Test String 123!@#';
      const encoded = stringToBase64(original);
      const decoded = base64ToString(encoded);
      expect(decoded).toBe(original);
    });
  });

  describe('round-trip conversions', () => {
    it('should round-trip bytes correctly', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0]);
      const encoded = bytesToBase64(original);
      const decoded = base64ToBytes(encoded);
      expect(decoded).toEqual(original);
    });

    it('should round-trip strings correctly', () => {
      const original = 'The quick brown fox jumps over the lazy dog';
      const encoded = stringToBase64(original);
      const decoded = base64ToString(encoded);
      expect(decoded).toBe(original);
    });

    it('should handle large data', () => {
      const size = 10000;
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        bytes[i] = i % 256;
      }
      const encoded = bytesToBase64(bytes);
      const decoded = base64ToBytes(encoded);
      expect(decoded).toEqual(bytes);
    });
  });
});
