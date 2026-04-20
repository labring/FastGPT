import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getParents } from '@/pages/api/core/dataset/paths';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { GetDatasetPathsResponseSchema } from '@fastgpt/global/openapi/core/dataset/api';
import { ParentIdSchema } from '@fastgpt/global/common/parentFolder/type';

class FakeObjectId {
  constructor(private readonly hex: string) {}
  toString() {
    return this.hex;
  }
}

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findById: vi.fn()
  },
  ChunkSettings: {},
  DatasetCollectionName: 'datasets'
}));

describe('getParents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array if parentId is undefined', async () => {
    const result = await getParents(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array if parent not found', async () => {
    vi.mocked(MongoDataset.findById).mockResolvedValueOnce(null);

    const result = await getParents('non-existent-id');
    expect(result).toEqual([]);
  });

  it('should return single parent path if no further parents', async () => {
    vi.mocked(MongoDataset.findById).mockResolvedValueOnce({
      name: 'Parent1',
      parentId: undefined
    });

    const result = await getParents('parent1-id');

    expect(result).toEqual([{ parentId: 'parent1-id', parentName: 'Parent1' }]);
  });

  it('should return full parent path for nested parents', async () => {
    vi.mocked(MongoDataset.findById)
      .mockResolvedValueOnce({
        name: 'Child',
        parentId: 'parent1-id'
      })
      .mockResolvedValueOnce({
        name: 'Parent1',
        parentId: 'parent2-id'
      })
      .mockResolvedValueOnce({
        name: 'Parent2',
        parentId: undefined
      });

    const result = await getParents('child-id');

    expect(result).toEqual([
      { parentId: 'parent2-id', parentName: 'Parent2' },
      { parentId: 'parent1-id', parentName: 'Parent1' },
      { parentId: 'child-id', parentName: 'Child' }
    ]);
  });

  it('should coerce ObjectId-like values through the response schema', async () => {
    const childHex = '69e5ca9ce4f63f23d53848da';
    const parentHex = '69e5ca9ce4f63f23d53848db';
    const childObjectId = new FakeObjectId(childHex);
    const parentObjectId = new FakeObjectId(parentHex);

    vi.mocked(MongoDataset.findById)
      .mockResolvedValueOnce({
        name: 'Child',
        parentId: parentObjectId
      })
      .mockResolvedValueOnce({
        name: 'Parent',
        parentId: null
      });

    const result = await getParents(childObjectId as unknown as string);
    const parsed = GetDatasetPathsResponseSchema.parse(result);

    expect(parsed).toEqual([
      { parentId: parentHex, parentName: 'Parent' },
      { parentId: childHex, parentName: 'Child' }
    ]);
    for (const item of parsed) {
      expect(typeof item.parentId).toBe('string');
    }
  });

  it('should handle circular references gracefully', async () => {
    vi.mocked(MongoDataset.findById)
      .mockResolvedValueOnce({
        name: 'Node1',
        parentId: 'node2-id'
      })
      .mockResolvedValueOnce({
        name: 'Node2',
        parentId: 'node1-id' // Circular reference
      });

    const result = await getParents('node1-id');

    expect(result).toEqual([
      { parentId: 'node2-id', parentName: 'Node2' },
      { parentId: 'node1-id', parentName: 'Node1' }
    ]);
  });
});

describe('ParentIdSchema', () => {
  const validHex = '69e5ca9ce4f63f23d53848da';

  describe('accepts', () => {
    it('24-char lowercase hex string (ObjectId shape)', () => {
      expect(ParentIdSchema.parse(validHex)).toBe(validHex);
    });

    it('24-char uppercase / mixed-case hex string', () => {
      const upper = 'ABCDEF0123456789ABCDEF01';
      const mixed = 'AbCdEf0123456789abcdef01';
      expect(ParentIdSchema.parse(upper)).toBe(upper);
      expect(ParentIdSchema.parse(mixed)).toBe(mixed);
    });

    it('empty string (root sentinel)', () => {
      expect(ParentIdSchema.parse('')).toBe('');
    });

    it('null', () => {
      expect(ParentIdSchema.parse(null)).toBeNull();
    });

    it('undefined', () => {
      expect(ParentIdSchema.parse(undefined)).toBeUndefined();
    });

    it('ObjectId-like object with toString', () => {
      const oid = new FakeObjectId(validHex);
      expect(ParentIdSchema.parse(oid)).toBe(validHex);
    });
  });

  describe('rejects', () => {
    it('arbitrary non-hex string', () => {
      expect(() => ParentIdSchema.parse('parent1-id')).toThrow();
      expect(() => ParentIdSchema.parse('not-an-id')).toThrow();
    });

    it('hex string with wrong length', () => {
      // 23 chars
      expect(() => ParentIdSchema.parse('69e5ca9ce4f63f23d53848d')).toThrow();
      // 25 chars
      expect(() => ParentIdSchema.parse('69e5ca9ce4f63f23d53848daa')).toThrow();
    });

    it('24-char string containing non-hex character', () => {
      expect(() => ParentIdSchema.parse('69e5ca9ce4f63f23d53848dz')).toThrow();
    });

    it('number', () => {
      expect(() => ParentIdSchema.parse(123)).toThrow();
    });

    it('boolean', () => {
      expect(() => ParentIdSchema.parse(true)).toThrow();
      expect(() => ParentIdSchema.parse(false)).toThrow();
    });

    it('plain object whose toString produces non-hex', () => {
      // String({}) -> "[object Object]" -> regex fails
      expect(() => ParentIdSchema.parse({})).toThrow();
      expect(() => ParentIdSchema.parse({ foo: 'bar' })).toThrow();
    });

    it('array', () => {
      // String([1, 2]) -> "1,2" -> regex fails
      expect(() => ParentIdSchema.parse([1, 2])).toThrow();
    });

    it('ObjectId-like object whose toString produces invalid hex', () => {
      const bad = new FakeObjectId('not-hex');
      expect(() => ParentIdSchema.parse(bad)).toThrow();
    });
  });
});
