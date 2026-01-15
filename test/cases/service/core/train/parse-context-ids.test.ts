import { describe, test, expect } from 'vitest';

/**
 * Parse expectedContextIds string into array of IDs
 * Supports multiple formats:
 * 1. Array string: "['id1','id2']" or "[id1,id2]"
 * 2. Comma-separated: "id1,id2,id3" or "id1, id2, id3"
 * 3. Space-separated: "id1 id2 id3"
 * 4. Single ID: "id1"
 */
function parseContextIds(expectedContextIds: string): string[] {
  let contextIds: string[];

  if (expectedContextIds.startsWith('[') && expectedContextIds.endsWith(']')) {
    // Array string format
    const innerContent = expectedContextIds.slice(1, -1).trim();
    contextIds = innerContent
      .split(',')
      .map((id) => id.trim().replace(/^['"]|['"]$/g, ''))
      .filter((id) => id.length > 0);
  } else if (expectedContextIds.includes(',')) {
    // Comma-separated format
    contextIds = expectedContextIds.split(',').map((id) => id.trim());
  } else if (expectedContextIds.includes(' ')) {
    // Space-separated format
    contextIds = expectedContextIds.split(/\s+/).filter((id) => id.length > 0);
  } else {
    // Single ID
    contextIds = [expectedContextIds];
  }

  return contextIds;
}

describe('Parse Context IDs', () => {
  describe('parseContextIds', () => {
    test('should parse array string format with single quotes and spaces', () => {
      const input = "['695caa1af155fc4606c1978f', '695ca980f155fc46']";
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should parse array string format with single quotes without spaces', () => {
      const input = "['695caa1af155fc4606c1978f','695ca980f155fc46']";
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should parse array string format without quotes', () => {
      const input = '[695caa1af155fc4606c1978f,695ca980f155fc46]';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should parse comma-separated format without spaces', () => {
      const input = '695caa1af155fc4606c1978f,695ca980f155fc46';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should parse comma-separated format with spaces', () => {
      const input = '695caa1af155fc4606c1978f, 695ca980f155fc46';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should parse space-separated format', () => {
      const input = '695caa1af155fc4606c1978f 695ca980f155fc46';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should parse single ID', () => {
      const input = '695caa1af155fc4606c1978f';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f']);
      expect(result).toHaveLength(1);
    });

    test('should handle array string with double quotes', () => {
      const input = '["695caa1af155fc4606c1978f", "695ca980f155fc46"]';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should handle array string with mixed quotes', () => {
      const input = `['695caa1af155fc4606c1978f', "695ca980f155fc46"]`;
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should handle multiple spaces in space-separated format', () => {
      const input = '695caa1af155fc4606c1978f    695ca980f155fc46';
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });

    test('should handle three or more IDs in array format', () => {
      const input = "['695caa1af155fc4606c1978f', '695ca980f155fc46', '695caa1af155fc4606c1979f']";
      const result = parseContextIds(input);

      expect(result).toEqual([
        '695caa1af155fc4606c1978f',
        '695ca980f155fc46',
        '695caa1af155fc4606c1979f'
      ]);
      expect(result).toHaveLength(3);
    });

    test('should handle three or more IDs in comma-separated format', () => {
      const input = '695caa1af155fc4606c1978f, 695ca980f155fc46, 695caa1af155fc4606c1979f';
      const result = parseContextIds(input);

      expect(result).toEqual([
        '695caa1af155fc4606c1978f',
        '695ca980f155fc46',
        '695caa1af155fc4606c1979f'
      ]);
      expect(result).toHaveLength(3);
    });

    test('should filter out empty strings in array format', () => {
      const input = "['695caa1af155fc4606c1978f', '', '695ca980f155fc46']";
      const result = parseContextIds(input);

      expect(result).toEqual(['695caa1af155fc4606c1978f', '695ca980f155fc46']);
      expect(result).toHaveLength(2);
    });
  });
});
