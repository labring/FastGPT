import { describe, expect, it } from 'vitest';
import { CollectionTrainingStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { canOpenCollectionTrainingStates } from '@/web/core/dataset/trainingStatus';

describe('canOpenCollectionTrainingStates', () => {
  it.each([
    [CollectionTrainingStatusEnum.running, true],
    [CollectionTrainingStatusEnum.error, true],
    [CollectionTrainingStatusEnum.ready, false],
    [undefined, false]
  ] as const)('opens modal for status %s: %s', (slowestTrainingStatus, expected) => {
    expect(canOpenCollectionTrainingStates({ slowestTrainingStatus })).toBe(expected);
  });
});
