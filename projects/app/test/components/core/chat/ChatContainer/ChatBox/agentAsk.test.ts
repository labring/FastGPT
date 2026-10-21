import { describe, expect, it } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { AgentAskInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import { getAIChatDisplayGroups } from '@/components/core/chat/ChatContainer/ChatBox/utils/agentAsk';

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
const preview: WorkflowBuilderPreviewInteractive = {
  type: 'workflowBuilderPreview',
  previewId: 'preview-1',
  params: {
    title: 'Confirm this workflow?',
    mermaid: 'flowchart LR\n  A --> B',
    sections: [],
    actions: [
      { value: 'confirm', label: 'Confirm and build', inputMode: 'none' },
      { value: 'revise', label: 'Revise', inputMode: 'text' },
      { value: 'cancel', label: 'Cancel', inputMode: 'none' }
    ],
    answerValue: 'confirm'
  }
};
const previewValue = {
  interactive: { ...preview, entryNodeIds: [], memoryEdges: [], nodeOutputs: [] }
} satisfies AIChatItemValueItemType;

describe('getAIChatDisplayGroups', () => {
  const runtime = { entryNodeIds: [], memoryEdges: [], nodeOutputs: [] };
  const getGroups = (
    chatValue: AIChatItemValueItemType[],
    overrides: Partial<Parameters<typeof getAIChatDisplayGroups>[0]> = {}
  ) => getAIChatDisplayGroups({ chatValue, isLastChild: true, isChatting: false, ...overrides });

  it('preserves ordinary output, independent AI placeholders, and other interactions', () => {
    expect(getGroups([before, after])).toEqual([
      { type: 'ai', values: [before] },
      { type: 'ai', values: [after] }
    ]);
    expect(getGroups([])).toEqual([{ type: 'ai', values: [{ text: { content: '' } }] }]);
    const select: AIChatItemValueItemType = {
      interactive: {
        type: 'userSelect',
        ...runtime,
        params: { description: '', userSelectOptions: [] }
      }
    };
    expect(getGroups([select])).toEqual([{ type: 'ai', values: [select] }]);
    expect(getGroups([{ ...askValue, hideInUI: true }, before])).toEqual([
      { type: 'ai', values: [before] }
    ]);
  });

  it.each([askValue, previewValue])(
    'never projects a user bubble or a waiting label from $interactive.type',
    (value) => {
      const original = structuredClone(value);
      for (const isLastChild of [true, false]) {
        for (const isChatting of [true, false]) {
          expect(getGroups([value], { isLastChild, isChatting })).toEqual([]);
          expect(getGroups([before, value, after], { isLastChild, isChatting })).toEqual([
            { type: 'ai', values: [before] },
            { type: 'ai', values: [after] }
          ]);
        }
      }
      expect(value).toEqual(original);
    }
  );

  it('hides pending, consecutive, and historical Ask interactions', () => {
    const pending: AIChatItemValueItemType = {
      interactive: { ...askValue.interactive, params: { ...ask.params, submitted: undefined } }
    };
    expect(getGroups([pending])).toEqual([]);
    expect(getGroups([pending], { isLastChild: false })).toEqual([]);
    expect(getGroups([askValue, previewValue])).toEqual([]);
    expect(getGroups([pending, { text: { content: '' } }], { isChatting: true })).toEqual([]);
  });

  it('preserves mixed text, processing and version output around the interaction', () => {
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
    const mixed = { ...askValue, ...before };
    expect(getGroups([processing, mixed, version])).toEqual([
      { type: 'ai', values: [processing] },
      { type: 'ai', values: [mixed] },
      { type: 'ai', values: [version] }
    ]);
  });

  it.each([askValue, previewValue])(
    'hides nested $interactive.type without hiding generated text',
    (value) => {
      const nested: AIChatItemValueItemType = {
        interactive: {
          type: 'childrenInteractive',
          ...runtime,
          params: { childrenResponse: value.interactive }
        }
      };
      expect(getGroups([nested])).toEqual([]);
      expect(getGroups([before, nested, after])).toEqual([
        { type: 'ai', values: [before] },
        { type: 'ai', values: [after] }
      ]);
    }
  );

  it('hides both answered and pending legacy ask records', () => {
    const legacy = {
      interactive: {
        type: 'agentPlanAskQuery',
        ...runtime,
        askId: 'legacy-1',
        params: { content: 'Choose?', options: ['A', 'B'], answer: 'B' }
      }
    } satisfies AIChatItemValueItemType;
    expect(getGroups([legacy])).toEqual([]);
    expect(
      getGroups([
        {
          interactive: {
            ...legacy.interactive,
            params: { content: 'Choose?', options: ['A', 'B'] }
          }
        }
      ])
    ).toEqual([]);
  });
});
