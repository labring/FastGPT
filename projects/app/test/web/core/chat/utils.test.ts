import { describe, expect, it } from 'vitest';
import { toChatAuthQueryInput } from '../../../../src/web/core/chat/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('web/core/chat/utils', () => {
  it('should stringify share auth data for chat query input', () => {
    const result = toChatAuthQueryInput({
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId: 'share-1',
        outLinkUid: 'uid-1'
      }
    });

    expect(result).toEqual({
      chatId: 'chat-1',
      outLinkAuthData: JSON.stringify({
        shareId: 'share-1',
        outLinkUid: 'uid-1'
      })
    });
  });

  it('should keep app target for chat query input', () => {
    expect(
      toChatAuthQueryInput({
        appId: '68ad85a7463006c963799a05',
        chatId: 'chat-1'
      })
    ).toEqual({
      appId: '68ad85a7463006c963799a05',
      chatId: 'chat-1'
    });
  });

  it('should keep runtime source target and stringify share auth data', () => {
    const result = toChatAuthQueryInput({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '68ad85a7463006c963799a05',
      searchKey: 'hello',
      outLinkAuthData: {
        shareId: 'share-1',
        outLinkUid: 'uid-1'
      }
    });

    expect(result).toEqual({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '68ad85a7463006c963799a05',
      searchKey: 'hello',
      outLinkAuthData: JSON.stringify({
        shareId: 'share-1',
        outLinkUid: 'uid-1'
      })
    });
  });
});
