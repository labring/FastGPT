import { describe, expect, it } from 'vitest';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  isDatasetDataProcessing,
  isDatasetDataRebuildFailed
} from '@fastgpt/global/core/dataset/data/utils';

const cases = [
  { status: undefined, processing: false, rebuildFailed: false },
  { status: DatasetDataIndexStatusEnum.indexing, processing: true, rebuildFailed: false },
  { status: DatasetDataIndexStatusEnum.indexed, processing: false, rebuildFailed: false },
  { status: DatasetDataIndexStatusEnum.error, processing: false, rebuildFailed: false },
  {
    status: DatasetDataIndexStatusEnum.rebuildIndexPending,
    processing: true,
    rebuildFailed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildIndexRunning,
    processing: true,
    rebuildFailed: false
  },
  { status: DatasetDataIndexStatusEnum.rebuildIndexFailed, processing: false, rebuildFailed: true },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymPending,
    processing: true,
    rebuildFailed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
    processing: true,
    rebuildFailed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
    processing: false,
    rebuildFailed: true
  }
];

describe('isDatasetDataProcessing', () => {
  it.each(cases)('identifies the processing boundary for $status', ({ status, processing }) => {
    expect(isDatasetDataProcessing(status)).toBe(processing);
  });
});

describe('isDatasetDataRebuildFailed', () => {
  it.each(cases)('identifies rebuild failure for $status', ({ status, rebuildFailed }) => {
    expect(isDatasetDataRebuildFailed(status)).toBe(rebuildFailed);
  });
});
