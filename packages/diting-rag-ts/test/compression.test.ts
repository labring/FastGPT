// src/utils/compression.test.ts
import { describe, it, expect } from 'vitest';
import { extractChatHistoryInfo } from '../src/utils/compression';
import type { LLMMessage } from '../src/types/message';

describe('compression', () => {
  describe('extractChatHistoryInfo', () => {
    it('should handle empty history', () => {
      const result = extractChatHistoryInfo([]);
      expect(result.previousTopics).toEqual([]);
      expect(result.previousPlaybooks).toEqual([]);
      expect(result.entities).toEqual([]);
    });

    it('should extract entities from messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Tell me about FastGPT' },
        { role: 'assistant', content: 'FastGPT is a knowledge base system.' },
        { role: 'user', content: 'How about DiTing?' }
      ];
      const result = extractChatHistoryInfo(messages);
      expect(result.summary).toContain('FastGPT');
    });

    it('should extract entities from user messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Tell me about FastGPT and DiTing' }
      ];
      const result = extractChatHistoryInfo(messages);
      expect(result.entities).toContain('FastGPT');
      expect(result.entities).toContain('DiTing');
    });

    it('should handle system messages', () => {
      const messages: LLMMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' }
      ];
      const result = extractChatHistoryInfo(messages);
      expect(result.summary).toBeTruthy();
    });
  });
});
