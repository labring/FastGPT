import { describe, expect, it } from 'vitest';
import { shouldFilterAiValue } from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/utils';

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
