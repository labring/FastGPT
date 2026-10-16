import { describe, expect, it } from 'vitest';
import {
  getWorkflowBuilderVersionDisplayState,
  isWorkflowBuilderVersionExpiredError
} from '@fastgpt/global/core/workflow/builder/utils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';

const version: WorkflowBuilderVersion = {
  versionNo: 1,
  name: 'AI 生成版本 1',
  filename: 'AI 生成版本 1.json',
  checksum: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-08-12T10:00:00.000Z'
};

describe('isWorkflowBuilderVersionExpiredError', () => {
  const expiredResponse = {
    code: 502005,
    statusText: AppErrEnum.workflowBuilderVersionExpired,
    message: '该工作流已过期，无法应用，请重新生成'
  };

  it('recognizes the stable API code independently of the message and wrapper', () => {
    expect(ERROR_RESPONSE[AppErrEnum.workflowBuilderVersionExpired].code).toBe(502005);
    expect(isWorkflowBuilderVersionExpiredError(expiredResponse)).toBe(true);
    expect(
      isWorkflowBuilderVersionExpiredError({
        response: { data: { ...expiredResponse, message: 'Version is no longer available' } }
      })
    ).toBe(true);
  });

  it.each([
    undefined,
    null,
    'expired',
    new Error('Workflow Builder version has expired'),
    { message: 'expired' },
    { code: 500, message: 'expired' },
    { code: '502005' },
    { response: { data: { code: 502000, message: 'expired' } } }
  ])('does not misclassify unrelated errors as expired (%s)', (error) => {
    expect(isWorkflowBuilderVersionExpiredError(error)).toBe(false);
  });
});

describe('getWorkflowBuilderVersionDisplayState', () => {
  it('returns ready for a version that has not been applied', () => {
    expect(getWorkflowBuilderVersionDisplayState({ version })).toBe('ready');
  });

  it('keeps an older archived version independently applicable', () => {
    expect(
      getWorkflowBuilderVersionDisplayState({
        version: { ...version, s3Key: 'chat/app/version.json' }
      })
    ).toBe('ready');
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
        version: { ...archived, appliedAt: '2026-08-12T11:00:00.000Z' },
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
        now: new Date('2026-08-13T10:00:00.000Z').getTime()
      })
    ).toBe('expired');
  });
});
