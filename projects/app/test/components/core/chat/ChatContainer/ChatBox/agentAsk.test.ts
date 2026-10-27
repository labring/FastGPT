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
    questions: [{ question: 'Which direction?', options: [{ summary: 'Option A', value: 'a' }] }]
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
    ]
  }
};
const previewValue = {
  interactive: { ...preview, entryNodeIds: [], memoryEdges: [], nodeOutputs: [] }
} satisfies AIChatItemValueItemType;

describe('getAIChatDisplayGroups', () => {
  it('ignores invalid old Ask payloads without losing surrounding text', () => {
    const legacy = {
      interactive: { type: 'agentAsk', params: { options: ['A', 'B'] } }
    } as unknown as AIChatItemValueItemType;
    const result = getAIChatDisplayGroups({
      chatValue: [before, legacy, after],
      isLastChild: true,
      isChatting: false
    });
    expect(result.flatMap((group) => group.values).filter((value) => value.text)).toEqual([
      before,
      after
    ]);
  });

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

  it('never projects a user bubble or a waiting label from Agent Ask', () => {
    const value = askValue;
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
  });

  it('preserves the workflow plan body across historical and streaming positions', () => {
    for (const isLastChild of [true, false]) {
      for (const isChatting of [true, false]) {
        expect(getGroups([previewValue], { isLastChild, isChatting })).toEqual([
          { type: 'ai', values: [previewValue] }
        ]);
        expect(getGroups([before, previewValue, after], { isLastChild, isChatting })).toEqual([
          { type: 'ai', values: [before] },
          { type: 'ai', values: [previewValue] },
          { type: 'ai', values: [after] }
        ]);
      }
    }
  });

  it('hides pending, consecutive, and historical Ask interactions', () => {
    const pending = askValue;
    expect(getGroups([pending])).toEqual([]);
    expect(getGroups([pending], { isLastChild: false })).toEqual([]);
    expect(getGroups([askValue, askValue])).toEqual([]);
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
    'preserves nested $interactive.type plan bodies while hiding Ask interactions',
    (value) => {
      const nested: AIChatItemValueItemType = {
        interactive: {
          type: 'childrenInteractive',
          ...runtime,
          params: { childrenResponse: value.interactive }
        }
      };
      const previewGroups =
        value.interactive.type === 'workflowBuilderPreview'
          ? [{ type: 'ai', values: [nested] }]
          : [];
      expect(getGroups([nested])).toEqual(previewGroups);
      expect(getGroups([before, nested, after])).toEqual([
        { type: 'ai', values: [before] },
        ...previewGroups,
        { type: 'ai', values: [after] }
      ]);
    }
  );
});
