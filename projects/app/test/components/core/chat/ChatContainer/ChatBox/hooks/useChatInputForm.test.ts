import { describe, expect, it } from 'vitest';
import { getChatInputDraftKey } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatInputForm';

describe('getChatInputDraftKey', () => {
  it('separates drafts with the same chatId but different sourceKey', () => {
    expect(getChatInputDraftKey({ sourceKey: 'app:app-1', chatId: 'chat-1' })).not.toBe(
      getChatInputDraftKey({ sourceKey: 'workflowBuilder:app-1', chatId: 'chat-1' })
    );
  });

  it('keeps a deterministic key while runtime identity is hydrating', () => {
    expect(getChatInputDraftKey({})).toBe('chatInput_:');
  });
});
