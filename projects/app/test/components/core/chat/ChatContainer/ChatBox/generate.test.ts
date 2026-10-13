import { describe, expect, it } from 'vitest';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import {
  isChatGeneratingError,
  safeAbortController,
  shouldRestoreSubmittedChatInput
} from '@/components/core/chat/ChatContainer/ChatBox/utils/generate';

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

describe('shouldRestoreSubmittedChatInput', () => {
  it('restores only input that was cleared by this send', () => {
    expect(shouldRestoreSubmittedChatInput({ clearInput: true })).toBe(true);
    expect(shouldRestoreSubmittedChatInput({ clearInput: false })).toBe(false);
  });

  it('does not restore input after a partial response was received', () => {
    expect(
      shouldRestoreSubmittedChatInput({ clearInput: true, responseText: 'partial response' })
    ).toBe(false);
  });
});

describe('safeAbortController', () => {
  it('safely aborts an active controller with reason', () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    safeAbortController(controller, reason);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe(reason);
  });

  it('safely ignores undefined or null controller', () => {
    expect(() => safeAbortController(undefined)).not.toThrow();
    expect(() => safeAbortController(null)).not.toThrow();
  });

  it('safely ignores already aborted controller without duplicate abort', () => {
    const controller = new AbortController();
    controller.abort('first');
    safeAbortController(controller, 'second');
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe('first');
  });

  it('suppresses errors thrown during controller.abort()', () => {
    const controller = {
      signal: { aborted: false },
      abort: () => {
        throw new DOMException('signal is aborted without reason', 'AbortError');
      }
    } as unknown as AbortController;

    expect(() => safeAbortController(controller, 'leave')).not.toThrow();
  });
});
