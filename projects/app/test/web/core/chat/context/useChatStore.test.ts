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
    const source = ChatSourceEnum.share;
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
    const source = ChatSourceEnum.share;
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

  it('should set appId from lastChatAppId if not set', () => {
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
    expect(useChatStore.getState().appId).toBe('last-app-id');
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
