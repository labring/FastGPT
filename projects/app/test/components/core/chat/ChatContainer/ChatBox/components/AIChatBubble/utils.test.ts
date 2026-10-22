import { describe, expect, it } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
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

describe('groupAIChatResponseValues', () => {
  const chatValue = [textValue('Round one'), textValue('Final answer')];

  it('keeps the existing response groups for ordinary chats', () => {
    expect(
      groupAIChatResponseValues({
        chatValue,
        isLastChild: true,
        isChatting: false
      })
    ).toEqual([[chatValue[0]], [chatValue[1]]]);
  });

  it('preserves the ordinary pending-interaction placeholder behavior', () => {
    const interactiveValue = {
      interactive: { type: 'workflowBuilderPreview', params: {} } as any
    };
    expect(
      groupAIChatResponseValues({
        chatValue: [chatValue[0], interactiveValue],
        isLastChild: true,
        isChatting: true
      })
    ).toEqual([[chatValue[0]], [interactiveValue], [{ text: { content: '' } }]]);
  });
});
