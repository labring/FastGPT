import { describe, expect, it } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowBuilderDisplayBlocks,
  getWorkflowBuilderFinalAnswerIndex,
  groupAIChatResponseValues,
  shouldFilterAiValue
} from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/utils';

const textValue = (content: string): AIChatItemValueItemType => ({
  text: { content }
});

describe('Workflow Builder version content', () => {
  const versionValue = {
    workflowBuilderVersion: {
      versionNo: 1,
      name: 'AI 生成版本 1',
      filename: 'AI 生成版本 1.json',
      checksum: `sha256:${'0'.repeat(64)}`,
      generatedAt: '2026-08-12T10:00:00.000Z'
    }
  } as const;

  it('keeps a standalone version card visible in an AI bubble', () => {
    expect(shouldFilterAiValue(versionValue)).toBe(false);
  });

  it('continues filtering an empty text placeholder', () => {
    expect(shouldFilterAiValue({ text: { content: '' } })).toBe(true);
  });

  it('continues preserving normal answer text', () => {
    expect(shouldFilterAiValue({ text: { content: 'Done' } })).toBe(false);
  });
});

describe('getWorkflowBuilderFinalAnswerIndex', () => {
  it('keeps all text inside processing while the response is generating', () => {
    expect(
      getWorkflowBuilderFinalAnswerIndex({
        chatValue: [textValue('Intermediate output')],
        isGenerating: true
      })
    ).toBe(-1);
  });

  it('selects only the last completed Agent text as the final answer', () => {
    expect(
      getWorkflowBuilderFinalAnswerIndex({
        chatValue: [textValue('Round one'), textValue('Round two'), textValue('Final answer')],
        isGenerating: false
      })
    ).toBe(2);
  });

  it('keeps earlier text folded when the response is waiting for an interaction', () => {
    expect(
      getWorkflowBuilderFinalAnswerIndex({
        chatValue: [
          textValue('Intermediate output'),
          { interactive: { type: 'workflowBuilderPreview', params: {} } as any }
        ],
        isGenerating: false
      })
    ).toBe(-1);
  });

  it('selects the final text appended after a resumed interaction', () => {
    expect(
      getWorkflowBuilderFinalAnswerIndex({
        chatValue: [
          textValue('Intermediate output'),
          { interactive: { type: 'workflowBuilderPreview', params: {} } as any },
          textValue('Final answer')
        ],
        isGenerating: false
      })
    ).toBe(2);
  });
});

describe('getWorkflowBuilderDisplayBlocks', () => {
  const confirmedPreview = {
    interactive: {
      type: 'workflowBuilderPreview',
      previewId: 'preview-1',
      params: {
        title: 'Preview',
        mermaid: 'flowchart LR',
        sections: [],
        actions: [],
        answerValue: 'confirm'
      }
    } as any
  };

  it('keeps processing segments on both sides of an interactive in chronological order', () => {
    const blocks = getWorkflowBuilderDisplayBlocks({
      chatValue: [
        { reasoning: { content: 'Before preview' } },
        confirmedPreview,
        { reasoning: { content: 'After preview' } }
      ],
      isGenerating: true
    });

    expect(blocks).toEqual([
      {
        type: 'process',
        valueIndices: [0],
        answerValueIndices: [],
        startIndex: 0,
        isProcessing: false
      },
      { type: 'interactive', valueIndex: 1 },
      {
        type: 'process',
        valueIndices: [2],
        answerValueIndices: [],
        startIndex: 2,
        isProcessing: true
      }
    ]);
  });

  it('shows an active processing segment immediately after a submitted interactive', () => {
    const blocks = getWorkflowBuilderDisplayBlocks({
      chatValue: [{ reasoning: { content: 'Before preview' } }, confirmedPreview],
      isGenerating: true
    });

    expect(blocks).toEqual([
      {
        type: 'process',
        valueIndices: [0],
        answerValueIndices: [],
        startIndex: 0,
        isProcessing: false
      },
      { type: 'interactive', valueIndex: 1 },
      {
        type: 'process',
        valueIndices: [],
        answerValueIndices: [],
        startIndex: 2,
        isProcessing: true
      }
    ]);
  });

  it('uses a submitted Agent Ask as a processing boundary', () => {
    const submittedAsk = {
      interactive: {
        type: 'agentAsk',
        askId: 'ask-1',
        responseMode: 'submit',
        params: {
          description: 'Choose one',
          questions: [],
          submitted: true
        }
      } as any
    };
    const blocks = getWorkflowBuilderDisplayBlocks({
      chatValue: [
        { reasoning: { content: 'Before ask' } },
        submittedAsk,
        { reasoning: { content: 'After ask' } }
      ],
      isGenerating: true
    });

    expect(blocks).toEqual([
      {
        type: 'process',
        valueIndices: [0],
        answerValueIndices: [],
        startIndex: 0,
        isProcessing: false
      },
      { type: 'interactive', valueIndex: 1 },
      {
        type: 'process',
        valueIndices: [2],
        answerValueIndices: [],
        startIndex: 2,
        isProcessing: true
      }
    ]);
  });

  it('does not show a new processing segment while an interactive is still pending', () => {
    const pendingPreview = {
      ...confirmedPreview,
      interactive: {
        ...confirmedPreview.interactive,
        params: {
          ...confirmedPreview.interactive.params,
          answerValue: undefined
        }
      }
    };
    const blocks = getWorkflowBuilderDisplayBlocks({
      chatValue: [{ reasoning: { content: 'Before preview' } }, pendingPreview],
      isGenerating: true
    });

    expect(blocks).toEqual([
      {
        type: 'process',
        valueIndices: [0],
        answerValueIndices: [],
        startIndex: 0,
        isProcessing: false
      },
      { type: 'interactive', valueIndex: 1 }
    ]);
  });

  it('keeps only the final Agent answer outside the completed processing segment', () => {
    const version = {
      workflowBuilderVersion: {
        versionNo: 1,
        name: 'AI generated version 1',
        filename: 'workflow.json',
        checksum: `sha256:${'0'.repeat(64)}`,
        generatedAt: '2026-08-18T00:00:00.000Z'
      }
    } as const;
    const blocks = getWorkflowBuilderDisplayBlocks({
      chatValue: [
        textValue('Intermediate answer'),
        confirmedPreview,
        { tools: [{ id: 'tool-1', functionName: 'workflow_cli_commit' }] as any },
        version,
        textValue('Final answer')
      ],
      isGenerating: false
    });

    expect(blocks).toEqual([
      {
        type: 'process',
        valueIndices: [0],
        answerValueIndices: [0],
        startIndex: 0,
        isProcessing: false
      },
      { type: 'interactive', valueIndex: 1 },
      {
        type: 'process',
        valueIndices: [2],
        answerValueIndices: [],
        startIndex: 2,
        isProcessing: false
      },
      { type: 'version', valueIndex: 3 },
      { type: 'finalAnswer', valueIndex: 4 }
    ]);
  });

  it('keeps process details from a mixed final value without rendering its answer twice', () => {
    const blocks = getWorkflowBuilderDisplayBlocks({
      chatValue: [
        textValue('Intermediate answer'),
        {
          reasoning: { content: 'Final reasoning' },
          text: { content: 'Final answer' }
        }
      ],
      isGenerating: false
    });

    expect(blocks).toEqual([
      {
        type: 'process',
        valueIndices: [0, 1],
        answerValueIndices: [0],
        startIndex: 0,
        isProcessing: false
      },
      { type: 'finalAnswer', valueIndex: 1 }
    ]);
  });
});

describe('groupAIChatResponseValues', () => {
  const chatValue = [textValue('Round one'), textValue('Final answer')];

  it('keeps the existing response groups for ordinary chats', () => {
    expect(
      groupAIChatResponseValues({
        chatValue,
        isLastChild: true,
        isChatting: false,
        collapseIntermediateAgentResponses: false
      })
    ).toEqual([[chatValue[0]], [chatValue[1]]]);
  });

  it('keeps the complete response in one group for Workflow Builder', () => {
    expect(
      groupAIChatResponseValues({
        chatValue,
        isLastChild: true,
        isChatting: false,
        collapseIntermediateAgentResponses: true
      })
    ).toEqual([chatValue]);
  });

  it('preserves the ordinary pending-interaction placeholder behavior', () => {
    const interactiveValue = {
      interactive: { type: 'workflowBuilderPreview', params: {} } as any
    };
    expect(
      groupAIChatResponseValues({
        chatValue: [chatValue[0], interactiveValue],
        isLastChild: true,
        isChatting: true,
        collapseIntermediateAgentResponses: false
      })
    ).toEqual([[chatValue[0]], [interactiveValue], [{ text: { content: '' } }]]);
  });
});
