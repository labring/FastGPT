import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore, createCustomStorage } from '@/web/core/chat/context/useChatStore';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';

// Mock getNanoid to return predictable values
vi.mock('@fastgpt/global/common/string/tools', () => ({
  getNanoid: () => 'test-generated-id'
}));

// Mock sessionStorage and localStorage
const mockStorage = {
  clear: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

vi.stubGlobal('sessionStorage', mockStorage);
vi.stubGlobal('localStorage', mockStorage);

describe('useChatStore', () => {
  beforeEach(() => {
    mockStorage.clear.mockClear();
    mockStorage.getItem.mockClear();
    mockStorage.setItem.mockClear();
    mockStorage.removeItem.mockClear();

    // Reset the store
    useChatStore.setState({
      source: undefined,
      appId: '',
      lastChatAppId: '',
      lastChatId: '',
      chatId: '',
      appChatIdMap: {},
      lastPane: undefined,
      outLinkAuthData: {}
    });
  });

  it('should set and get source', () => {
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.share);
    expect(useChatStore.getState().source).toBe(ChatSourceEnum.share);
  });

  it('should set and get appId', () => {
    const store = useChatStore.getState();
    store.setAppId('test-app-id');
    const newState = useChatStore.getState();
    expect(newState.appId).toBe('test-app-id');
    expect(newState.lastChatAppId).toBe('test-app-id');
  });

  it('should use a new chatId when switching to app without saved chat', () => {
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.online);
    store.setAppId('app-a');
    store.setChatId('chat-from-app-a');

    store.setAppId('app-b');

    const newState = useChatStore.getState();
    expect(newState.appId).toBe('app-b');
    expect(newState.chatId).toBe('test-generated-id');
    expect(newState.chatId).not.toBe('chat-from-app-a');
    expect(newState.lastChatId).toBe(`${ChatSourceEnum.online}-test-generated-id`);
  });

  it('should save and restore chatId per app when switching appId', () => {
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.online);
    store.setAppId('app-a');
    store.setChatId('chat-a');

    store.setAppId('app-b');
    store.setChatId('chat-b');

    store.setAppId('app-a');
    expect(useChatStore.getState().chatId).toBe('chat-a');

    store.setAppId('app-b');
    expect(useChatStore.getState().chatId).toBe('chat-b');
  });

  it('should namespace app chat cache by source', () => {
    const store = useChatStore.getState();

    store.setSource(ChatSourceEnum.online);
    store.setAppId('app-a');
    store.setChatId('online-chat-id');

    store.setSource(ChatSourceEnum.api);
    store.setAppId('app-b');
    store.setChatId('api-chat-id');

    expect(useChatStore.getState().appChatIdMap).toMatchObject({
      [`${ChatSourceEnum.online}:app-a`]: 'online-chat-id',
      [`${ChatSourceEnum.api}:app-b`]: 'api-chat-id'
    });
  });

  it('should not restore app cached chatId for share source', () => {
    const store = useChatStore.getState();

    useChatStore.setState({
      source: ChatSourceEnum.share,
      appChatIdMap: {
        [`${ChatSourceEnum.online}:app-a`]: 'normal-chat-id',
        [`${ChatSourceEnum.share}:app-a`]: 'legacy-share-chat-id',
        [`${ChatSourceEnum.share}:share-a:user-a:app-a`]: 'share-chat-id'
      }
    });

    store.setAppId('app-a');

    const newState = useChatStore.getState();
    expect(newState.chatId).toBe('test-generated-id');
    expect(newState.chatId).not.toBe('normal-chat-id');
    expect(newState.chatId).not.toBe('legacy-share-chat-id');
    expect(newState.chatId).not.toBe('share-chat-id');
  });

  it('should save share chatId with share identity namespace', () => {
    const store = useChatStore.getState();

    store.setSource(ChatSourceEnum.share);
    store.setAppId('app-a');
    store.setOutLinkAuthData({ shareId: 'share-a', outLinkUid: 'user-a' });
    store.setChatId('share-chat-id');

    expect(useChatStore.getState().appChatIdMap).toEqual({
      [`${ChatSourceEnum.share}:share-a:user-a:app-a`]: 'share-chat-id'
    });
  });

  it('should restore share chatId only with matched share identity namespace', () => {
    const store = useChatStore.getState();

    useChatStore.setState({
      source: ChatSourceEnum.share,
      appId: 'app-a',
      chatId: 'new-chat-id',
      appChatIdMap: {
        [`${ChatSourceEnum.share}:share-a:user-a:app-a`]: 'matched-share-chat',
        [`${ChatSourceEnum.share}:share-a:user-b:app-a`]: 'other-user-chat'
      }
    });

    store.setOutLinkAuthData({ shareId: 'share-a', outLinkUid: 'user-a' });

    expect(useChatStore.getState().chatId).toBe('matched-share-chat');
  });

  it('should not restore last chatId for share source', () => {
    const store = useChatStore.getState();

    useChatStore.setState({
      source: undefined,
      chatId: '',
      lastChatId: `${ChatSourceEnum.share}-cached-share-chat`
    });

    store.setSource(ChatSourceEnum.share);

    const newState = useChatStore.getState();
    expect(newState.chatId).toBe('test-generated-id');
    expect(newState.chatId).not.toBe('cached-share-chat');
  });

  it('should keep chatId when setting the same appId', () => {
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.online);
    store.setAppId('app-a');
    store.setChatId('stable-chat-id');

    store.setAppId('app-a');

    const newState = useChatStore.getState();
    expect(newState.chatId).toBe('stable-chat-id');
  });

  it('should set and get chatId', () => {
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.share);
    store.setChatId('test-chat-id');
    const newState = useChatStore.getState();
    expect(newState.chatId).toBe('test-chat-id');
    expect(newState.lastChatId).toBe(`${ChatSourceEnum.share}-test-chat-id`);
  });

  it('should set and get lastPane', () => {
    const store = useChatStore.getState();
    store.setLastPane(ChatSidebarPaneEnum.HOME);
    expect(useChatStore.getState().lastPane).toBe(ChatSidebarPaneEnum.HOME);
  });

  it('should set and get outLinkAuthData', () => {
    const store = useChatStore.getState();
    const authData = { appId: 'test-app', apiKey: 'test-key' };
    store.setOutLinkAuthData(authData as any);
    expect(useChatStore.getState().outLinkAuthData).toEqual(authData);
  });

  it('should restore last chat when setting same source and lastChatId with different id', () => {
    const store = useChatStore.getState();
    const source = ChatSourceEnum.online;
    const chatId = 'test';
    useChatStore.setState({
      lastChatId: `${source}-${chatId}`,
      source: undefined,
      chatId: '',
      lastChatAppId: 'test-app'
    });
    store.setSource(source);
    expect(useChatStore.getState().chatId).toBe('test');
  });

  // The expected value should be 'test', not 'test-generated-id', since lastChatId is '${source}-test'
  it('should restore last chat when setting same source and lastChatId with id that matches getNanoid', () => {
    const store = useChatStore.getState();
    const source = ChatSourceEnum.online;
    const chatId = 'test';

    useChatStore.setState({
      lastChatId: `${source}-${chatId}`,
      source: undefined,
      chatId: '',
      lastChatAppId: 'test-app'
    });

    store.setSource(source);
    // It should restore chatId to 'test' from lastChatId, not 'test-generated-id'
    expect(useChatStore.getState().chatId).toBe('test');
  });

  it('should not restore last chat if lastChatId does not match source', () => {
    const store = useChatStore.getState();
    const source = ChatSourceEnum.share;
    useChatStore.setState({
      lastChatId: `${ChatSourceEnum.api}-test-generated-id`,
      source: undefined,
      chatId: '',
      lastChatAppId: 'test-app'
    });
    store.setSource(source);
    // Should generate a new chatId, which is 'test-generated-id' due to our mock
    expect(useChatStore.getState().chatId).toBe('test-generated-id');
  });

  it('should generate new chatId when setting different source', () => {
    const store = useChatStore.getState();

    store.setSource(ChatSourceEnum.share);
    store.setChatId('old-chat-id');

    const oldChatId = store.chatId;

    store.setSource(ChatSourceEnum.api);
    const newState = useChatStore.getState();
    expect(newState.chatId).toBe('test-generated-id');
    expect(newState.chatId).not.toBe(oldChatId);
  });

  it('should not set appId if empty string provided', () => {
    const store = useChatStore.getState();
    const initialState = useChatStore.getState();
    store.setAppId('');
    expect(useChatStore.getState()).toEqual(initialState);
  });

  it('should set lastChatAppId', () => {
    const store = useChatStore.getState();
    store.setLastChatAppId('my-last-app');
    expect(useChatStore.getState().lastChatAppId).toBe('my-last-app');
  });

  it('should setChatId with undefined to generate a new id', () => {
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.api);
    store.setChatId();
    expect(useChatStore.getState().chatId).toBe('test-generated-id');
    expect(useChatStore.getState().lastChatId).toBe(`${ChatSourceEnum.api}-test-generated-id`);
  });

  it('should not set appId from lastChatAppId when source changes', () => {
    useChatStore.setState({
      appId: '',
      lastChatAppId: 'last-app-id',
      source: undefined,
      chatId: '',
      lastChatId: '',
      lastPane: undefined,
      outLinkAuthData: {}
    });
    const store = useChatStore.getState();
    store.setSource(ChatSourceEnum.api);
    expect(useChatStore.getState().appId).toBe('');
    expect(useChatStore.getState().lastChatAppId).toBe('last-app-id');
  });

  it('should reset chat cache', () => {
    const store = useChatStore.getState();
    useChatStore.setState({
      source: ChatSourceEnum.share,
      appId: 'app-id',
      lastChatAppId: 'last-app-id',
      chatId: 'chat-id',
      lastChatId: `${ChatSourceEnum.share}-chat-id`,
      lastPane: ChatSidebarPaneEnum.RECENTLY_USED_APPS,
      outLinkAuthData: {
        shareId: 'share-id',
        outLinkUid: 'outlink-uid'
      }
    });

    store.resetChatCache();

    expect(useChatStore.getState()).toMatchObject({
      source: undefined,
      appId: '',
      lastChatAppId: '',
      chatId: '',
      lastChatId: '',
      appChatIdMap: {},
      lastPane: ChatSidebarPaneEnum.HOME,
      outLinkAuthData: {}
    });
  });

  it('should set lastPane to undefined by default', () => {
    expect(useChatStore.getState().lastPane).toBeUndefined();
  });
});

describe('createCustomStorage', () => {
  beforeEach(() => {
    mockStorage.clear.mockClear();
    mockStorage.getItem.mockClear();
    mockStorage.setItem.mockClear();
    mockStorage.removeItem.mockClear();
  });

  it('should store session and local data separately', () => {
    const storage = createCustomStorage();
    const testData = {
      state: {
        source: 'session-data',
        appId: 'session-data',
        chatId: 'session-data',
        lastChatId: 'local-data',
        lastChatAppId: 'local-data',
        lastPane: 'local-data'
      },
      version: 0
    };

    mockStorage.getItem.mockReturnValue('{}');
    storage.setItem('test', JSON.stringify(testData));

    expect(mockStorage.setItem).toHaveBeenCalledTimes(2);
  });

  it('should merge session and local data when getting item', () => {
    const storage = createCustomStorage();

    mockStorage.getItem
      .mockReturnValueOnce(
        JSON.stringify({
          state: { source: 'session-data' },
          version: 0
        })
      )
      .mockReturnValueOnce(
        JSON.stringify({
          state: { lastChatId: 'local-data' },
          version: 0
        })
      );

    const result = JSON.parse(storage.getItem('test'));
    expect(result.state).toEqual({
      source: 'session-data',
      lastChatId: 'local-data'
    });
  });

  it('should remove items from both storages', () => {
    const storage = createCustomStorage();
    storage.removeItem('test');
    expect(mockStorage.removeItem).toHaveBeenCalledTimes(2);
    expect(mockStorage.removeItem).toHaveBeenCalledWith('test');
  });
});
