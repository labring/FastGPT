import { describe, expect, it } from 'vitest';
import {
  getWorkflowBuilderAttentionKeys,
  getWorkflowBuilderEntryAccess,
  getWorkflowBuilderErrorAttentionKey,
  getWorkflowBuilderEntryVisualState,
  getWorkflowBuilderInitialState,
  getWorkflowBuilderPendingInteractiveKey,
  getWorkflowBuilderWatchChatId,
  hasUnseenWorkflowBuilderAttention,
  isWorkflowBuilderVersionGenerating
} from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/uiState';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatItemObjItemType } from '@fastgpt/global/core/chat/type';

/** 复用完整预览协议，状态场景仅改变预览 ID 和确认结果。 */
const createPreviewInteractive = (
  previewId = 'preview-1'
): Extract<WorkflowInteractiveResponseType, { type: 'workflowBuilderPreview' }> => ({
  type: 'workflowBuilderPreview',
  previewId,
  entryNodeIds: [],
  memoryEdges: [],
  nodeOutputs: [],
  params: {
    title: '方案预览',
    mermaid: 'flowchart LR\nA --> B',
    sections: [],
    actions: [
      { value: 'confirm', label: '确认', inputMode: 'none' },
      { value: 'revise', label: '修改', inputMode: 'text' },
      { value: 'cancel', label: '取消', inputMode: 'none' }
    ]
  }
});

describe('getWorkflowBuilderWatchChatId', () => {
  it('从单值或数组路由参数中读取旁观会话 ID，并忽略空值', () => {
    expect(getWorkflowBuilderWatchChatId('chat-1')).toBe('chat-1');
    expect(getWorkflowBuilderWatchChatId(['chat-2', 'chat-3'])).toBe('chat-2');
    expect(getWorkflowBuilderWatchChatId('   ')).toBeUndefined();
    expect(getWorkflowBuilderWatchChatId()).toBeUndefined();
  });
});

describe('getWorkflowBuilderEntryAccess', () => {
  it('keeps an upgrade entry for editable community apps', () => {
    expect(
      getWorkflowBuilderEntryAccess({
        systemInitialized: true,
        isPlus: false,
        showAgentSandbox: false,
        showWorkflowBuilder: false,
        canEdit: true
      })
    ).toBe('upgrade');
  });

  it('hides the entry without write permission', () => {
    expect(
      getWorkflowBuilderEntryAccess({
        systemInitialized: true,
        isPlus: false,
        showAgentSandbox: true,
        showWorkflowBuilder: true,
        canEdit: false
      })
    ).toBe('hidden');
  });

  it('hides the entry until the system edition has been initialized', () => {
    expect(
      getWorkflowBuilderEntryAccess({
        systemInitialized: false,
        isPlus: false,
        showAgentSandbox: false,
        showWorkflowBuilder: false,
        canEdit: true
      })
    ).toBe('hidden');
  });

  it.each([
    { showAgentSandbox: false, showWorkflowBuilder: true },
    { showAgentSandbox: true, showWorkflowBuilder: false }
  ])(
    'hides the commercial entry when an administrator disables a dependency',
    ({ showAgentSandbox, showWorkflowBuilder }) => {
      expect(
        getWorkflowBuilderEntryAccess({
          systemInitialized: true,
          isPlus: true,
          showAgentSandbox,
          showWorkflowBuilder,
          canEdit: true
        })
      ).toBe('hidden');
    }
  );

  it('enables the entry when all Builder requirements are met', () => {
    expect(
      getWorkflowBuilderEntryAccess({
        systemInitialized: true,
        isPlus: true,
        showAgentSandbox: true,
        showWorkflowBuilder: true,
        canEdit: true
      })
    ).toBe('enabled');
  });
});

describe('getWorkflowBuilderInitialState', () => {
  it('falls back to system config for editable apps when Builder is unavailable', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: true,
        entryAccess: 'hidden',
        shouldAutoOpen: true,
        hasCompletedSystemConfigFirstEntryGuide: true,
        hasCompletedWorkflowBuilderFirstEntryGuide: false
      })
    ).toEqual({
      activeLeftPanel: 'systemConfig',
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    });
  });

  it('preserves the first-entry system config behavior when Builder is unavailable', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: true,
        entryAccess: 'hidden',
        shouldAutoOpen: false,
        hasCompletedSystemConfigFirstEntryGuide: false,
        hasCompletedWorkflowBuilderFirstEntryGuide: false
      })
    ).toEqual({
      activeLeftPanel: 'systemConfig',
      shouldCompleteSystemConfigFirstEntryGuide: true,
      shouldFocusWorkflowBuilder: false
    });
  });

  it('does not open an editing panel without write permission', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: false,
        entryAccess: 'hidden',
        shouldAutoOpen: true,
        hasCompletedSystemConfigFirstEntryGuide: false,
        hasCompletedWorkflowBuilderFirstEntryGuide: false
      })
    ).toEqual({
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    });
  });

  it('keeps the two-step guide for editable community apps', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: true,
        entryAccess: 'upgrade',
        shouldAutoOpen: true,
        hasCompletedSystemConfigFirstEntryGuide: true,
        hasCompletedWorkflowBuilderFirstEntryGuide: false
      })
    ).toEqual({
      guideStep: 'systemConfig',
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    });
  });

  it('waits for an explicit upgrade click after the community guide is completed', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: true,
        entryAccess: 'upgrade',
        shouldAutoOpen: true,
        hasCompletedSystemConfigFirstEntryGuide: true,
        hasCompletedWorkflowBuilderFirstEntryGuide: true
      })
    ).toEqual({
      activeLeftPanel: undefined,
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    });
  });

  it('keeps the two-step guide when Builder is available for the first time', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: true,
        entryAccess: 'enabled',
        shouldAutoOpen: true,
        hasCompletedSystemConfigFirstEntryGuide: true,
        hasCompletedWorkflowBuilderFirstEntryGuide: false
      })
    ).toEqual({
      guideStep: 'systemConfig',
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    });
  });

  it('opens and focuses Builder when its guide has already been completed', () => {
    expect(
      getWorkflowBuilderInitialState({
        canEdit: true,
        entryAccess: 'enabled',
        shouldAutoOpen: true,
        hasCompletedSystemConfigFirstEntryGuide: true,
        hasCompletedWorkflowBuilderFirstEntryGuide: true
      })
    ).toEqual({
      activeLeftPanel: 'workflowBuilder',
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: true
    });
  });
});

describe('getWorkflowBuilderEntryVisualState', () => {
  it('allows the attention dot to overlap the generating halo', () => {
    expect(
      getWorkflowBuilderEntryVisualState({
        isChatGenerating: true,
        hasPendingAttention: true
      })
    ).toEqual({
      showGeneratingHalo: true,
      showAttentionDot: true
    });
  });

  it('hides the halo as soon as the Workflow Builder chat stops generating', () => {
    expect(
      getWorkflowBuilderEntryVisualState({
        isChatGenerating: false,
        hasPendingAttention: true
      })
    ).toEqual({
      showGeneratingHalo: false,
      showAttentionDot: true
    });
  });
});

describe('getWorkflowBuilderAttentionKeys', () => {
  it('shows attention only for unseen ask, pending-version, or runtime-error keys', () => {
    const attentionKeys = getWorkflowBuilderAttentionKeys({
      pendingInteractiveKey: 'interactive:response-1:0',
      pendingVersionChecksum: 'checksum-1',
      errorAttentionKey: 'error:response-2'
    });

    expect(attentionKeys).toEqual([
      'interactive:response-1:0',
      'version:checksum-1',
      'error:response-2'
    ]);
    expect(
      hasUnseenWorkflowBuilderAttention({ attentionKeys, acknowledgedAttentionKeys: [] })
    ).toBe(true);
    expect(
      hasUnseenWorkflowBuilderAttention({
        attentionKeys,
        acknowledgedAttentionKeys: attentionKeys
      })
    ).toBe(false);
  });
});

describe('getWorkflowBuilderErrorAttentionKey', () => {
  it('uses the failed run record as a stable runtime-error attention key', () => {
    const failedResponse = {
      dataId: 'response-error-1',
      obj: ChatRoleEnum.AI,
      value: [],
      errorMsg: 'Sandbox crashed'
    } as ChatItemObjItemType & { dataId: string };

    expect(
      getWorkflowBuilderErrorAttentionKey({
        chatRecords: [failedResponse],
        chatGenerateStatus: ChatGenerateStatusEnum.error
      })
    ).toBe('error:response-error-1');
    expect(
      getWorkflowBuilderErrorAttentionKey({
        chatRecords: [failedResponse],
        chatGenerateStatus: ChatGenerateStatusEnum.done
      })
    ).toBeUndefined();
  });
});

describe('getWorkflowBuilderPendingInteractiveKey', () => {
  it('uses the pending interactive position as a stable ask attention key', () => {
    const pendingPreview = {
      dataId: 'response-1',
      obj: ChatRoleEnum.AI,
      value: [
        {
          interactive: createPreviewInteractive()
        }
      ]
    } as ChatItemObjItemType & { dataId: string };

    expect(getWorkflowBuilderPendingInteractiveKey([pendingPreview])).toBe(
      'interactive:response-1:0:workflowBuilderPreview:preview-1'
    );
    expect(
      getWorkflowBuilderPendingInteractiveKey([pendingPreview], { isBuildingWorkflow: true })
    ).toBeUndefined();
  });
});

describe('isWorkflowBuilderVersionGenerating', () => {
  it.each([
    { value: '确认并开始搭建', expected: true },
    { value: '取消本次搭建', expected: false },
    { value: '增加审核分支', expected: false },
    { value: 'confirm', expected: false }
  ])('matches the adjacent preview button label: $value', ({ value, expected }) => {
    const interactive = createPreviewInteractive();
    interactive.params.actions[0].label = '确认并开始搭建';
    const preview: ChatItemObjItemType = { obj: ChatRoleEnum.AI, value: [{ interactive }] };
    const answer: ChatItemObjItemType = {
      obj: ChatRoleEnum.Human,
      value: [
        { select: { type: 'workflowBuilderPreview', questions: [{ question: '方案预览', value }] } }
      ]
    };

    expect(
      isWorkflowBuilderVersionGenerating({ chatRecords: [preview, answer], isChatGenerating: true })
    ).toBe(expected);
    expect(
      isWorkflowBuilderVersionGenerating({ chatRecords: [answer], isChatGenerating: true })
    ).toBe(false);
  });

  it('identifies the version-building substage after Mermaid confirmation', () => {
    const preview = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          interactive: createPreviewInteractive('preview-1')
        }
      ]
    } as ChatItemObjItemType;
    const confirmation: ChatItemObjItemType = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          select: {
            type: 'workflowBuilderPreview',
            questions: [{ question: '方案预览', value: '确认' }]
          }
        }
      ]
    };
    const version = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          workflowBuilderVersion: {
            versionNo: 1,
            name: 'Version 1',
            filename: 'version-1.json',
            generatedAt: '2026-08-12T10:00:00.000Z',
            checksum: 'checksum-1',
            s3Key: 'workflow-builder/version-1.json'
          }
        }
      ]
    } as ChatItemObjItemType;
    const nextPendingPreview = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          interactive: createPreviewInteractive('preview-2')
        }
      ]
    } as ChatItemObjItemType;

    expect(isWorkflowBuilderVersionGenerating({ chatRecords: [], isChatGenerating: true })).toBe(
      false
    );
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [preview, confirmation],
        isChatGenerating: true
      })
    ).toBe(true);
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [preview, confirmation, version],
        isChatGenerating: true
      })
    ).toBe(false);
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [preview, confirmation],
        isChatGenerating: false
      })
    ).toBe(false);
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [],
        isChatGenerating: true,
        wasBuildingWorkflow: true
      })
    ).toBe(true);
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [version],
        isChatGenerating: true,
        wasBuildingWorkflow: true
      })
    ).toBe(false);
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [preview, version, nextPendingPreview],
        isChatGenerating: true,
        wasBuildingWorkflow: true
      })
    ).toBe(true);
    expect(
      isWorkflowBuilderVersionGenerating({
        chatRecords: [],
        isChatGenerating: false,
        wasBuildingWorkflow: true
      })
    ).toBe(false);
  });
});
