import { describe, it, expect } from 'vitest';
import {
  parseParentIdInMongo,
  getAllDescendantIds
} from '@fastgpt/global/common/parentFolder/utils';

describe('parseParentIdInMongo', () => {
  it('should return empty object for undefined', () => {
    expect(parseParentIdInMongo(undefined)).toEqual({});
  });

  it('should normalize null or empty string to null parentId', () => {
    expect(parseParentIdInMongo(null)).toEqual({ parentId: null });
    expect(parseParentIdInMongo('')).toEqual({ parentId: null });
  });

  it('should accept valid 24-char hex id', () => {
    const lowerId = '5f47ac10b58c1b1e3c0a1234';
    const upperId = '5F47AC10B58C1B1E3C0A1234';

    expect(parseParentIdInMongo(lowerId)).toEqual({ parentId: lowerId });
    expect(parseParentIdInMongo(upperId)).toEqual({ parentId: upperId });
  });

  it('should ignore invalid parentId', () => {
    expect(parseParentIdInMongo('123')).toEqual({});
    expect(parseParentIdInMongo('5f47ac10b58c1b1e3c0a123g')).toEqual({});
  });
});

describe('getAllDescendantIds', () => {
  it('should return only parentId when there are no children', async () => {
    const findChildren = async (_parentIds: string[]) => [];
    const result = await getAllDescendantIds(findChildren, '5f47ac10b58c1b1e3c0a1234');
    expect(result).toEqual(['5f47ac10b58c1b1e3c0a1234']);
  });

  it('should return all descendant ids for a single level', async () => {
    const findChildren = async (parentIds: string[]) => {
      if (parentIds.includes('parent1')) {
        return [{ _id: 'child1' }, { _id: 'child2' }];
      }
      return [];
    };
    const result = await getAllDescendantIds(findChildren, 'parent1');
    expect(result).toEqual(['parent1', 'child1', 'child2']);
  });

  it('should return all descendant ids for multiple levels', async () => {
    const calls: string[][] = [];
    const findChildren = async (parentIds: string[]) => {
      calls.push([...parentIds]);
      if (parentIds.includes('parent1')) {
        return [{ _id: 'child1' }, { _id: 'child2' }];
      }
      if (parentIds.includes('child1')) {
        return [{ _id: 'grandchild1' }];
      }
      return [];
    };
    const result = await getAllDescendantIds(findChildren, 'parent1');
    expect(result).toEqual(['parent1', 'child1', 'child2', 'grandchild1']);
    expect(calls).toHaveLength(3);
  });

  it('should detect and break circular parentId references', async () => {
    // A → B → C → A (cycle)
    const findChildren = async (parentIds: string[]) => {
      if (parentIds.includes('A')) return [{ _id: 'B' }];
      if (parentIds.includes('B')) return [{ _id: 'C' }];
      if (parentIds.includes('C')) return [{ _id: 'A' }];
      return [];
    };
    const result = await getAllDescendantIds(findChildren, 'A');
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should not add duplicate ids when multiple parents share a child', async () => {
    // A → C, B → C (diamond shape, not a cycle but shared child)
    const findChildren = async (parentIds: string[]) => {
      if (parentIds.includes('A') || parentIds.includes('B')) return [{ _id: 'C' }];
      return [];
    };
    const result = await getAllDescendantIds(findChildren, 'A');
    expect(result).toEqual(['A', 'C']);
  });
});
