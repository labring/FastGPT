import { describe, expect, it } from 'vitest';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { isChatGeneratingError } from '@/components/core/chat/ChatContainer/ChatBox/utils/generate';

describe('isChatGeneratingError', () => {
  it('recognizes direct, Error and HTTP response errors', () => {
    expect(isChatGeneratingError(ChatErrEnum.chatIsGenerating)).toBe(true);
    expect(isChatGeneratingError(new Error(ChatErrEnum.chatIsGenerating))).toBe(true);
    expect(isChatGeneratingError({ statusText: ChatErrEnum.chatIsGenerating })).toBe(true);
    expect(
      isChatGeneratingError({
        response: { data: { statusText: ChatErrEnum.chatIsGenerating } }
      })
    ).toBe(true);
  });

  it('rejects unrelated or malformed errors', () => {
    expect(isChatGeneratingError({ statusText: ChatErrEnum.unAuthChat })).toBe(false);
    expect(isChatGeneratingError(new Error('Other error'))).toBe(false);
    expect(isChatGeneratingError(undefined)).toBe(false);
  });
});
