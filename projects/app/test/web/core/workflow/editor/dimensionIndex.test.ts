import { describe, expect, it } from 'vitest';
import {
  createDimensionBatcher,
  type DimensionMeasurement
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/context/dimensionIndex';

describe('workflow dimension batcher', () => {
  it('commits only the latest measurement for each node in one frame', () => {
    const frames: Array<() => void> = [];
    const flushed: DimensionMeasurement[][] = [];
    const batcher = createDimensionBatcher({
      scheduler: {
        schedule: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancel: () => {}
      },
      onFlush: (updates) => flushed.push(updates)
    });

    batcher.enqueue({
      nodeId: 'node-a',
      generation: 1,
      dimension: { width: 100, height: 40 }
    });
    batcher.enqueue({
      nodeId: 'node-a',
      generation: 2,
      dimension: { width: 120, height: 48 }
    });
    batcher.enqueue({
      nodeId: 'node-b',
      generation: 2,
      dimension: { width: 200, height: 80 }
    });

    expect(frames).toHaveLength(1);
    expect(flushed).toEqual([]);

    frames[0]();

    expect(flushed).toEqual([
      [
        {
          nodeId: 'node-a',
          generation: 2,
          dimension: { width: 120, height: 48 }
        },
        {
          nodeId: 'node-b',
          generation: 2,
          dimension: { width: 200, height: 80 }
        }
      ]
    ]);
  });

  it('drops invalid or removed measurements before the frame commits', () => {
    const frames: Array<() => void> = [];
    const flushed: DimensionMeasurement[][] = [];
    const batcher = createDimensionBatcher({
      scheduler: {
        schedule: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancel: () => {}
      },
      onFlush: (updates) => flushed.push(updates)
    });

    batcher.enqueue({
      nodeId: 'invalid',
      generation: 1,
      dimension: { width: Number.NaN, height: 40 }
    });
    batcher.enqueue({
      nodeId: 'removed',
      generation: 1,
      dimension: { width: 100, height: 40 }
    });
    batcher.remove('removed');

    frames[0]();

    expect(flushed).toEqual([]);
  });
});
