import { vi } from 'vitest';

// Mock tracking utilities - automatically mock all methods
vi.mock('@fastgpt/service/common/middle/tracks/utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  // Get all methods from original pushTrack and mock them
  const mockedPushTrack: Record<string, any> = {};
  if (actual.pushTrack) {
    Object.keys(actual.pushTrack).forEach((key) => {
      mockedPushTrack[key] = vi.fn();
    });
  }

  return {
    ...actual,
    pushTrack: mockedPushTrack
  };
});
