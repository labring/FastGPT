import { describe, expect, it } from 'vitest';
import {
  CHAT_GENERATING_SCROLL_BOTTOM_THRESHOLD,
  CHAT_SCROLL_TO_BOTTOM_BUTTON_DISTANCE_THRESHOLD,
  getChatScrollBottomDistance,
  getChatScrollTargetKey,
  isChatScrollAtBottom,
  shouldFollowGeneratingScroll,
  shouldForceScrollAfterRecordsLoaded,
  shouldShowChatScrollToBottomButton
} from '@/components/core/chat/ChatContainer/ChatBox/utils/scrollUtils';

describe('ChatBox scrollUtils', () => {
  it('should build stable scroll target keys only when appId and chatId exist', () => {
    expect(getChatScrollTargetKey({ appId: 'app-1', chatId: 'chat-1' })).toBe('app-1:chat-1');
    expect(getChatScrollTargetKey({ appId: 'app-1' })).toBeUndefined();
    expect(getChatScrollTargetKey({ chatId: 'chat-1' })).toBeUndefined();
  });

  it('should force scroll after a different chat records loaded', () => {
    expect(
      shouldForceScrollAfterRecordsLoaded({
        isChatRecordsLoaded: false,
        targetKey: 'app-1:chat-1',
        lastScrolledTargetKey: undefined
      })
    ).toBe(false);
    expect(
      shouldForceScrollAfterRecordsLoaded({
        isChatRecordsLoaded: true,
        targetKey: undefined,
        lastScrolledTargetKey: undefined
      })
    ).toBe(false);
    expect(
      shouldForceScrollAfterRecordsLoaded({
        isChatRecordsLoaded: true,
        targetKey: 'app-1:chat-1',
        lastScrolledTargetKey: undefined
      })
    ).toBe(true);
    expect(
      shouldForceScrollAfterRecordsLoaded({
        isChatRecordsLoaded: true,
        targetKey: 'app-1:chat-2',
        lastScrolledTargetKey: 'app-1:chat-1'
      })
    ).toBe(true);
    expect(
      shouldForceScrollAfterRecordsLoaded({
        isChatRecordsLoaded: true,
        targetKey: 'app-1:chat-1',
        lastScrolledTargetKey: 'app-1:chat-1'
      })
    ).toBe(false);
  });

  it('should keep generating follow-scroll limited to near-bottom unless forced', () => {
    expect(
      shouldFollowGeneratingScroll({
        scrollTop: 0,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(false);
    expect(
      shouldFollowGeneratingScroll({
        scrollTop: 350,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(true);
    expect(
      shouldFollowGeneratingScroll({
        scrollTop: 0,
        clientHeight: 500,
        scrollHeight: 1000,
        force: true
      })
    ).toBe(true);
    expect(
      shouldFollowGeneratingScroll({
        scrollTop: 1000 - 500 - CHAT_GENERATING_SCROLL_BOTTOM_THRESHOLD - 1,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(false);
    expect(
      shouldFollowGeneratingScroll({
        scrollTop: 1000 - 500 - CHAT_GENERATING_SCROLL_BOTTOM_THRESHOLD,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(true);
  });

  it('should identify whether chat scroll is already at bottom', () => {
    expect(
      isChatScrollAtBottom({
        scrollTop: 496,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(true);
    expect(
      isChatScrollAtBottom({
        scrollTop: 495,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(false);
    expect(
      isChatScrollAtBottom({
        scrollTop: 0,
        clientHeight: 500,
        scrollHeight: 500
      })
    ).toBe(true);
  });

  it('should show scroll-to-bottom button only after leaving bottom enough', () => {
    expect(
      getChatScrollBottomDistance({
        scrollTop: 400,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(100);
    expect(
      shouldShowChatScrollToBottomButton({
        scrollTop: 1000 - 500 - CHAT_SCROLL_TO_BOTTOM_BUTTON_DISTANCE_THRESHOLD,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(false);
    expect(
      shouldShowChatScrollToBottomButton({
        scrollTop: 1000 - 500 - CHAT_SCROLL_TO_BOTTOM_BUTTON_DISTANCE_THRESHOLD - 1,
        clientHeight: 500,
        scrollHeight: 1000
      })
    ).toBe(true);
    expect(
      shouldShowChatScrollToBottomButton({
        scrollTop: 1000 - 500 - CHAT_SCROLL_TO_BOTTOM_BUTTON_DISTANCE_THRESHOLD - 1,
        clientHeight: 500,
        scrollHeight: 1000,
        userHasLeftBottom: false
      })
    ).toBe(false);
  });
});
