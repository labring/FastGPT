import { describe, expect, it } from 'vitest';
import { buildModelOrderMoves, sortModelOrderItems } from '@fastgpt/global/core/ai/model/order';

const applyMoves = (currentIds: string[], moves: ReturnType<typeof buildModelOrderMoves>) => {
  const result = [...currentIds];
  for (const { modelId, beforeModelId } of moves) {
    const sourceIndex = result.indexOf(modelId);
    result.splice(sourceIndex, 1);
    const targetIndex = beforeModelId === null ? result.length : result.indexOf(beforeModelId);
    result.splice(targetIndex, 0, modelId);
  }
  return result;
};

describe('sortModelOrderItems', () => {
  it('sorts persisted ranks first and preserves input order for legacy or tied ranks', () => {
    const items = [
      { modelId: 'legacy', sortOrder: undefined },
      { modelId: 'rank-two', sortOrder: 2 },
      { modelId: 'rank-one-a', sortOrder: 1 },
      { modelId: 'rank-one-b', sortOrder: 1 }
    ];

    expect(sortModelOrderItems(items).map(({ modelId }) => modelId)).toEqual([
      'rank-one-a',
      'rank-one-b',
      'rank-two',
      'legacy'
    ]);
  });

  it('treats unsafe ranks as legacy values', () => {
    const items = [
      { modelId: 'unsafe', sortOrder: Number.MAX_SAFE_INTEGER + 1 },
      { modelId: 'ranked', sortOrder: 1 }
    ];

    expect(sortModelOrderItems(items).map(({ modelId }) => modelId)).toEqual(['ranked', 'unsafe']);
  });
});

describe('buildModelOrderMoves', () => {
  it('emits no moves for an unchanged order', () => {
    expect(buildModelOrderMoves(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('moves one item to the front with one operation', () => {
    const current = ['a', 'b', 'c', 'd'];
    const target = ['c', 'a', 'b', 'd'];
    const moves = buildModelOrderMoves(current, target);

    expect(moves).toEqual([{ modelId: 'c', beforeModelId: 'a' }]);
    expect(applyMoves(current, moves)).toEqual(target);
  });

  it('moves a reversed order using the minimum number of moves', () => {
    const current = ['a', 'b', 'c', 'd'];
    const target = ['d', 'c', 'b', 'a'];
    const moves = buildModelOrderMoves(current, target);

    expect(applyMoves(current, moves)).toEqual(target);
    expect(moves).toHaveLength(3);
  });

  it('moves to the end with a null anchor', () => {
    const current = ['a', 'b', 'c'];
    const target = ['b', 'c', 'a'];
    const moves = buildModelOrderMoves(current, target);

    expect(moves).toEqual([{ modelId: 'a', beforeModelId: null }]);
    expect(applyMoves(current, moves)).toEqual(target);
  });

  it('handles lists larger than the generic 500-item batch limit', () => {
    const current = Array.from({ length: 501 }, (_, index) => `model-${index}`);
    const target = [...current.slice(1), current[0]];
    const moves = buildModelOrderMoves(current, target);

    expect(moves).toEqual([{ modelId: current[0], beforeModelId: null }]);
    expect(applyMoves(current, moves)).toEqual(target);
  });

  it('rejects lists that do not contain the same unique IDs', () => {
    expect(() => buildModelOrderMoves(['a', 'b'], ['a', 'c'])).toThrow(
      'Current and target model orders must contain the same unique IDs'
    );
    expect(() => buildModelOrderMoves(['a', 'a'], ['a', 'a'])).toThrow();
  });
});
