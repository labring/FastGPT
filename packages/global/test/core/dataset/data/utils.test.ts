import { describe, expect, it } from 'vitest';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  isDatasetDataProcessing,
  isDatasetDataFailed
} from '@fastgpt/global/core/dataset/data/utils';

const cases = [
  { status: undefined, processing: false, failed: false },
  { status: DatasetDataIndexStatusEnum.indexing, processing: true, failed: false },
  { status: DatasetDataIndexStatusEnum.indexed, processing: false, failed: false },
  { status: DatasetDataIndexStatusEnum.error, processing: false, failed: true },
  {
    status: DatasetDataIndexStatusEnum.rebuildIndexPending,
    processing: true,
    failed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildIndexRunning,
    processing: true,
    failed: false
  },
  { status: DatasetDataIndexStatusEnum.rebuildIndexFailed, processing: false, failed: true },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymPending,
    processing: true,
    failed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
    processing: true,
    failed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
    processing: false,
    failed: true
  }
];

describe('isDatasetDataProcessing', () => {
  it.each(cases)('identifies the processing boundary for $status', ({ status, processing }) => {
    expect(isDatasetDataProcessing(status)).toBe(processing);
  });
});

describe('isDatasetDataFailed', () => {
  it.each(cases)('identifies data failure for $status', ({ status, failed }) => {
    expect(isDatasetDataFailed(status)).toBe(failed);
  });
});
