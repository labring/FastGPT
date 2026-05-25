import { describe, expect, it } from 'vitest';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { isChatRoundPending } from '@/components/core/chat/ChatContainer/ChatBox/utils/chatStatus';

describe('isChatRoundPending', () => {
  it('returns true while the local chat is streaming', () => {
    expect(
      isChatRoundPending({
        isChatting: true,
        chatGenerateStatus: ChatGenerateStatusEnum.done
      })
    ).toBe(true);
  });

  it('returns true while the server status is generating', () => {
    expect(
      isChatRoundPending({
        isChatting: false,
        chatGenerateStatus: ChatGenerateStatusEnum.generating
      })
    ).toBe(true);
  });

  it('returns true when the latest AI item has not finished', () => {
    expect(
      isChatRoundPending({
        isChatting: false,
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        lastChat: {
          obj: ChatRoleEnum.AI,
          status: 'loading'
        }
      })
    ).toBe(true);
  });

  it('returns false when there is no running signal', () => {
    expect(
      isChatRoundPending({
        isChatting: false,
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        lastChat: {
          obj: ChatRoleEnum.AI,
          status: 'finish'
        }
      })
    ).toBe(false);
  });
});
