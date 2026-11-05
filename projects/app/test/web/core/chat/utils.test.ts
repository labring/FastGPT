import { describe, expect, it } from 'vitest';
import {
  getChatAuthTargetInput,
  toChatAuthQueryInput,
  hasChatAuthTargetInput,
  toChatAuthApiTarget
} from '../../../../src/web/core/chat/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('proxy Query encoding', () => {
  it.each([{ customUid: 'customer' }, { authProxy: { tmbId: 'member' } }])(
    'preserves the user identity when extracting a citation target: %j',
    (identity) => {
      expect(getChatAuthTargetInput({ appId: 'app', ...identity })).toMatchObject({
        appId: 'app',
        ...identity
      });
      expect(() => getChatAuthTargetInput({ skillId: 'skill', ...identity })).toThrow();
    }
  );

  it('encodes the normalized proxy as a JSON string while keeping chat fields', () => {
    expect(
      toChatAuthQueryInput({ appId: 'app', chatId: 'chat', authProxy: { tmbId: 'member' } })
    ).toEqual({ appId: 'app', chatId: 'chat', authProxy: '{"tmbId":"member"}' });
  });
});

describe('web/core/chat/utils', () => {
  it('recognizes only one complete chat context and preserves external priority when building requests', () => {
    const outLinkAuthData = { shareId: 'share-1', outLinkUid: 'uid-1' };
    expect(hasChatAuthTargetInput({ appId: 'app-1' })).toBe(true);
    expect(
      hasChatAuthTargetInput({ appId: 'app-1', sourceType: ChatSourceTypeEnum.workflowBuilder })
    ).toBe(true);
    expect(hasChatAuthTargetInput({ skillId: 'skill-1' })).toBe(true);
    expect(hasChatAuthTargetInput({ outLinkAuthData })).toBe(true);
    expect(hasChatAuthTargetInput({})).toBe(false);
    expect(hasChatAuthTargetInput({ appId: 'app-1', skillId: 'skill-1' })).toBe(false);
    expect(hasChatAuthTargetInput({ appId: 'app-1', outLinkAuthData })).toBe(false);
    expect(hasChatAuthTargetInput({ skillId: 'skill-1', sourceType: ChatSourceTypeEnum.app })).toBe(
      false
    );
    expect(
      hasChatAuthTargetInput({ skillId: 'skill-1', sourceType: ChatSourceTypeEnum.workflowBuilder })
    ).toBe(false);
    expect(hasChatAuthTargetInput({ outLinkAuthData: { shareId: 'share-1' } })).toBe(false);
    expect(
      toChatAuthApiTarget({
        sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
        outLinkAuthData
      })
    ).toEqual({ outLinkAuthData });
  });

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
