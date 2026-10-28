import { describe, expect, it } from 'vitest';
import {
  getWorkflowBuilderErrorLog,
  getWorkflowBuilderVersionDisplayState,
  isWorkflowBuilderVersionExpiredError,
  getWorkflowBuilderPreview,
  getWorkflowBuilderPreviewDecision,
  getWorkflowBuilderPreviewToolResponse
} from '@fastgpt/global/core/workflow/builder/utils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserError } from '@fastgpt/global/common/error/utils';
import type {
  WorkflowBuilderVersion,
  WorkflowBuilderPreviewInteractive
} from '@fastgpt/global/core/workflow/builder/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

const version: WorkflowBuilderVersion = {
  versionNo: 1,
  name: 'AI 生成版本 1',
  filename: 'AI 生成版本 1.json',
  checksum: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-08-12T10:00:00.000Z'
};

describe('getWorkflowBuilderErrorLog', () => {
  it.each([
    [AppErrEnum.workflowBuilderVersionExpired, 'version_expired'],
    [AppErrEnum.workflowBuilderVersionNotFound, 'version_not_found'],
    ['Workflow Builder version checksum mismatch', 'checksum_mismatch'],
    ['Workflow Builder version has been superseded', 'version_superseded'],
    ['Workflow Builder version file is invalid', 'version_file_invalid'],
    ['Workflow Builder version has not been archived', 'version_not_archived'],
    ['private workflow body', 'workflow_error'],
    ['constructor', 'workflow_error'],
    ['__proto__', 'workflow_error']
  ])('preserves controlled service reasons for %s', (message, reason) => {
    expect(getWorkflowBuilderErrorLog(new UserError(message))).toEqual({
      reason,
      errorType: 'Error'
    });
  });
  it('keeps numeric error codes and expiration reason without serializing private contents', () => {
    expect(
      getWorkflowBuilderErrorLog({
        response: {
          data: { code: 502005, message: 'private/s3/key', document: { secret: 'credential' } }
        }
      })
    ).toEqual({ reason: 'version_expired', errorType: 'Error', code: 502005 });
    expect(getWorkflowBuilderErrorLog(new TypeError('private content'))).toEqual({
      reason: 'workflow_error',
      errorType: 'TypeError'
    });
    expect(getWorkflowBuilderErrorLog({ code: 'private-key' })).toEqual({
      reason: 'workflow_error',
      errorType: 'Error'
    });
  });
});

const preview: WorkflowBuilderPreviewInteractive = {
  type: 'workflowBuilderPreview',
  previewId: 'preview',
  params: {
    title: 'Plan',
    mermaid: 'flowchart TD\n A-->B',
    sections: []
  }
};

describe('getWorkflowBuilderPreview', () => {
  it('accepts only valid preview display values from the latest interactive', () => {
    expect(getWorkflowBuilderPreview([])).toBeUndefined();
    expect(
      getWorkflowBuilderPreview([{ interactive: { ...preview, previewId: '' } }])
    ).toBeUndefined();
    expect(
      getWorkflowBuilderPreview([
        { interactive: preview },
        {
          interactive: {
            type: 'agentAsk',

            params: { askId: 'ask', blockerType: 'user_choice', description: '', questions: [] },
            entryNodeIds: [],
            memoryEdges: [],
            nodeOutputs: []
          }
        }
      ])
    ).toBeUndefined();
    expect(getWorkflowBuilderPreview([{ interactive: preview }])).toEqual(preview);
  });
});

describe('getWorkflowBuilderPreviewDecision', () => {
  it('ignores empty and unrelated answers without mutating the preview', () => {
    const before = structuredClone(preview);
    for (const value of [
      [],
      [{ text: { content: '   ' } }],
      [
        {
          select: {
            type: 'agentAsk' as const,
            questions: [{ question: 'Other', value: 'Confirm' }]
          }
        }
      ]
    ]) {
      expect(
        getWorkflowBuilderPreviewDecision({
          preview,
          userContent: { obj: ChatRoleEnum.Human, value }
        })
      ).toBeUndefined();
    }
    expect(preview).toEqual(before);
  });
  it.each(['confirm', 'revise', 'cancel'] as const)(
    'reads %s directly from the standalone action',
    (action) => {
      expect(
        getWorkflowBuilderPreviewDecision({
          preview,
          userContent: {
            obj: ChatRoleEnum.Human,
            value: [
              {
                select:
                  action === 'revise'
                    ? { type: 'workflowBuilderPreview', action, reviseText: 'Add review' }
                    : { type: 'workflowBuilderPreview', action }
              }
            ]
          }
        })
      ).toEqual({
        previewId: preview.previewId,
        action,
        ...(action === 'revise' ? { feedback: 'Add review' } : {})
      });
    }
  );
  it('uses only reviseText for revision feedback', () => {
    expect(
      getWorkflowBuilderPreviewDecision({
        preview,
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [
            {
              select: {
                type: 'workflowBuilderPreview',
                action: 'revise',

                reviseText: '  Add a review  '
              }
            }
          ]
        }
      })
    ).toEqual({ previewId: preview.previewId, action: 'revise', feedback: 'Add a review' });
    expect(
      getWorkflowBuilderPreviewDecision({
        preview,
        userContent: { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Confirm' } }] }
      })
    ).toEqual({ previewId: preview.previewId, action: 'revise', feedback: 'Confirm' });
  });
});

describe('getWorkflowBuilderPreviewToolResponse', () => {
  it.each([
    { action: 'confirm' as const, state: 'confirmed', taskComplete: false },
    { action: 'revise' as const, state: 'revision_requested', taskComplete: false },
    { action: 'cancel' as const, state: 'cancelled', taskComplete: true }
  ])(
    'exposes the decision only in the projected tool response: $action',
    ({ action, state, taskComplete }) => {
      const result = getWorkflowBuilderPreviewToolResponse({ previewId: 'preview', action });
      expect(result).toMatchObject({ decision: action, state, taskComplete });
      if (action === 'revise') expect(result.feedback).toBe('');
      expect(preview.params).not.toHaveProperty('decision');
    }
  );
});

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
