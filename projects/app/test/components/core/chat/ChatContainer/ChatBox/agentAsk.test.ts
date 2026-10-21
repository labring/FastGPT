import { describe, expect, it } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { AgentAskInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getAIChatDisplayGroups } from '@/components/core/chat/ChatContainer/ChatBox/utils/agentAsk';
import {
  getWorkflowBuilderDisplayBlocks,
  getWorkflowBuilderFinalAnswerIndex
} from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/utils';

const ask: AgentAskInteractive = {
  type: 'agentAsk',
  askId: 'ask-1',
  params: {
    description: 'Choose a direction',
    questions: [
      { question: 'Which direction?', options: [{ summary: 'Option A', value: 'a' }], answer: 'a' }
    ],
    submitted: true
  }
};
const askValue = {
  interactive: { ...ask, entryNodeIds: [], memoryEdges: [], nodeOutputs: [] }
} satisfies AIChatItemValueItemType;
const before: AIChatItemValueItemType = { text: { content: 'Before ask' } };
const after: AIChatItemValueItemType = { text: { content: 'After ask' } };

describe.each([false, true])('getAIChatDisplayGroups (collapse=%s)', (collapse) => {
  const getGroups = (
    chatValue: AIChatItemValueItemType[],
    overrides: Partial<Parameters<typeof getAIChatDisplayGroups>[0]> = {}
  ) =>
    getAIChatDisplayGroups({
      chatValue,
      isLastChild: true,
      isChatting: false,
      collapseIntermediateAgentResponses: collapse,
      ...overrides
    });

  it('preserves ordinary responses, empty placeholders, and non-Ask interactions', () => {
    expect(getGroups([before, after])).toEqual(
      collapse
        ? [{ type: 'ai', values: [before, after] }]
        : [
            { type: 'ai', values: [before] },
            { type: 'ai', values: [after] }
          ]
    );
    expect(getGroups([])).toEqual([{ type: 'ai', values: [{ text: { content: '' } }] }]);

    const select: AIChatItemValueItemType = {
      interactive: {
        type: 'userSelect',
        params: { description: '', userSelectOptions: [] },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    };
    expect(getGroups([select])).toEqual([{ type: 'ai', values: [select] }]);
    expect(getGroups([{ ...askValue, hideInUI: true }, before])).toEqual([
      { type: 'ai', values: [before] }
    ]);
  });

  it('hides pending Ask content while retaining preceding AI output', () => {
    const pending = {
      ...askValue,
      interactive: { ...askValue.interactive, params: { ...ask.params, submitted: false } }
    };
    expect(getGroups([pending])).toEqual([]);
    expect(getGroups([pending], { isChatting: true })).toEqual([]);
    expect(getGroups([before, pending])).toEqual([
      { type: 'ai', values: collapse ? [before, pending] : [before] }
    ]);
  });

  it('places a readonly user reply between AI segments without changing stored values', () => {
    const values = [before, askValue, after];
    const groups = getGroups(values);

    expect(groups).toEqual([
      { type: 'ai', values: collapse ? [before, askValue] : [before] },
      { type: 'agentAsk', interactive: askValue.interactive },
      { type: 'ai', values: [after] }
    ]);
    expect(values).toEqual([before, askValue, after]);
    if (collapse && groups[0].type === 'ai') {
      expect(
        getWorkflowBuilderFinalAnswerIndex({ chatValue: groups[0].values, isGenerating: false })
      ).toBe(-1);
    }
  });

  it('keeps consecutive Ask submissions in order without creating empty AI bubbles', () => {
    const second: AIChatItemValueItemType = {
      interactive: { ...askValue.interactive, askId: 'ask-2' }
    };
    expect(getGroups([askValue, second])).toEqual([
      { type: 'agentAsk', interactive: askValue.interactive },
      { type: 'agentAsk', interactive: second.interactive }
    ]);
  });

  it('preserves processing and workflow version cards on both sides of an Ask', () => {
    const processing: AIChatItemValueItemType = { reasoning: { content: 'Thinking' } };
    const version: AIChatItemValueItemType = {
      workflowBuilderVersion: {
        versionNo: 1,
        name: 'Workflow v1',
        filename: 'workflow.json',
        checksum: `sha256:${'0'.repeat(64)}`,
        generatedAt: '2026-08-12T10:00:00.000Z'
      }
    };
    expect(getGroups([processing, askValue, version])).toEqual([
      { type: 'ai', values: collapse ? [processing, askValue] : [processing] },
      { type: 'agentAsk', interactive: askValue.interactive },
      { type: 'ai', values: [version] }
    ]);
  });

  it('shows new AI activity after submitting, before the next response event', () => {
    const groups = getGroups([askValue], { isChatting: true });
    expect(groups.map((group) => group.type)).toEqual(['agentAsk', 'ai']);
    const lastGroup = groups[1];
    if (lastGroup.type !== 'ai') throw new Error('Missing active AI group');

    if (collapse) {
      expect(
        getWorkflowBuilderDisplayBlocks({ chatValue: lastGroup.values, isGenerating: true })
      ).toContainEqual({
        type: 'process',
        valueIndices: [],
        answerValueIndices: [],
        startIndex: 1,
        isProcessing: true
      });
    } else {
      expect(lastGroup.values).toEqual([{ text: { content: '' } }]);
    }
    expect(getGroups([askValue], { isLastChild: false, isChatting: true })).toHaveLength(1);
  });

  it('keeps non-Ask content on mixed values and nested workflow interactions', () => {
    const mixed = { ...askValue, ...before };
    expect(getGroups([mixed])).toEqual([
      { type: 'ai', values: [mixed] },
      { type: 'agentAsk', interactive: askValue.interactive }
    ]);

    const nested: AIChatItemValueItemType = {
      interactive: {
        type: 'childrenInteractive',
        params: { childrenResponse: askValue.interactive },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    };
    expect(getGroups([nested])).toEqual([{ type: 'agentAsk', interactive: askValue.interactive }]);
  });

  it('treats finished historical records without submitted as readonly replies', () => {
    const historical: AIChatItemValueItemType = {
      interactive: {
        ...askValue.interactive,
        params: { ...ask.params, submitted: undefined }
      }
    };
    expect(getGroups([historical], { isLastChild: false })).toEqual([
      { type: 'agentAsk', interactive: historical.interactive }
    ]);
  });

  it('adapts answered legacy asks and hides unanswered ones in the active record', () => {
    const legacy = {
      interactive: {
        type: 'agentPlanAskQuery',
        askId: 'ask-1',
        params: {
          content: 'Which direction?',
          reason: 'Need clarification',
          options: ['A', 'B'],
          answer: 'B'
        },
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    } satisfies AIChatItemValueItemType;
    expect(getGroups([legacy])).toEqual([
      {
        type: 'agentAsk',
        interactive: {
          type: 'agentAsk',
          askId: 'ask-1',
          params: {
            description: 'Need clarification',
            questions: [
              {
                question: 'Which direction?',
                options: [
                  { summary: 'A', value: 'A' },
                  { summary: 'B', value: 'B' }
                ],
                answer: 'B'
              }
            ],
            submitted: true
          }
        }
      }
    ]);

    const pending: AIChatItemValueItemType = {
      interactive: {
        ...legacy.interactive,
        params: { content: 'Which direction?', options: [] }
      }
    };
    expect(getGroups([pending])).toEqual([]);
    expect(getGroups([pending], { isLastChild: false })).toMatchObject([
      {
        type: 'agentAsk',
        interactive: {
          params: { description: '', questions: [{ answer: '' }] }
        }
      }
    ]);
  });
});
