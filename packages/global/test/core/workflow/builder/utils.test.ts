import { describe, expect, it } from 'vitest';
import { getWorkflowBuilderVersionDisplayState } from '@fastgpt/global/core/workflow/builder/utils';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';

const version: WorkflowBuilderVersion = {
  versionNo: 1,
  name: 'AI 生成版本 1',
  filename: 'AI 生成版本 1.json',
  checksum: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-08-12T10:00:00.000Z'
};

describe('getWorkflowBuilderVersionDisplayState', () => {
  it('returns ready only for the latest unarchived version', () => {
    expect(getWorkflowBuilderVersionDisplayState({ version, isLatestReady: true })).toBe('ready');
    expect(getWorkflowBuilderVersionDisplayState({ version, isLatestReady: false })).toBe(
      'superseded'
    );
  });

  it('returns available for a valid archived version', () => {
    const archived = {
      ...version,
      s3Key: 'chat/app/version.json',
      expiresAt: '2026-08-13T10:00:00.000Z'
    };
    const now = new Date('2026-08-12T12:00:00.000Z').getTime();

    expect(
      getWorkflowBuilderVersionDisplayState({
        version: archived,
        isLatestReady: false,
        now
      })
    ).toBe('available');
  });

  it('treats expiresAt as authoritative for an archived version', () => {
    expect(
      getWorkflowBuilderVersionDisplayState({
        version: {
          ...version,
          s3Key: 'chat/app/version.json',
          expiresAt: '2026-08-13T10:00:00.000Z'
        },
        isLatestReady: false,
        now: new Date('2026-08-13T10:00:00.000Z').getTime()
      })
    ).toBe('expired');
  });
});
