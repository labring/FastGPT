import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, createCustomStorage } from '@/web/core/chat/context/useChatStore';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

vi.mock('@fastgpt/global/common/string/tools', () => ({
  getNanoid: vi.fn().mockReturnValue('test-nanoid')
}));

const mockStorage = () => {
  const store = new Map();
  return {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    clear: () => store.clear(),
    removeItem: (key: string) => store.delete(key)
  };
};

const mockWindow = () => {
  const windowMock = {
    location: {
      search: '?appId=test123'
    },
    sessionStorage: mockStorage(),
    localStorage: mockStorage()
  };

  vi.stubGlobal('window', windowMock);
  global.sessionStorage = windowMock.sessionStorage;
  global.localStorage = windowMock.localStorage;
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockWindow();
  const store = useChatStore.getState();
  store.source = undefined;
  store.appId = '';
  store.chatId = '';
  store.lastChatId = '';
  store.lastChatAppId = '';
  store.outLinkAuthData = {};
  sessionStorage.clear();
  localStorage.clear();
});

describe('useChatStore', () => {
  it('should set source and restore last chat if available', () => {
    const store = useChatStore.getState();
    store.lastChatAppId = 'app123';
    store.lastChatId = `${ChatSourceEnum.share}-chat123`;

    store.setSource(ChatSourceEnum.share);

    const updatedStore = useChatStore.getState();
    expect(updatedStore.source).toBe(ChatSourceEnum.share);
    expect(updatedStore.chatId).toBe('chat123');
    expect(updatedStore.lastChatAppId).toBe('app123');
  });

  it('should generate new chatId when source changes', () => {
    const store = useChatStore.getState();
    store.source = ChatSourceEnum.share;
    store.chatId = 'old-id';

    store.setSource(ChatSourceEnum.api);
    const updatedStore = useChatStore.getState();

    expect(updatedStore.chatId).toBe('test-nanoid');
    expect(updatedStore.chatId).not.toBe('old-id');
  });

  it('should set appId and lastChatAppId', () => {
    const store = useChatStore.getState();
    store.setAppId('test123');
    const updatedStore = useChatStore.getState();

    expect(updatedStore.appId).toBe('test123');
    expect(updatedStore.lastChatAppId).toBe('test123');
  });

  it('should not set empty appId', () => {
    const store = useChatStore.getState();
    store.setAppId('test123');
    store.setAppId('');
    const updatedStore = useChatStore.getState();

    expect(updatedStore.appId).toBe('test123');
    expect(updatedStore.lastChatAppId).toBe('test123');
  });

  it('should set chatId and lastChatId', () => {
    const store = useChatStore.getState();
    store.source = ChatSourceEnum.share;
    store.setChatId('test-id');
    const updatedStore = useChatStore.getState();

    expect(updatedStore.chatId).toBe('test-id');
    expect(updatedStore.lastChatId).toBe(`${ChatSourceEnum.share}-test-id`);
  });

  it('should generate new chatId if none provided', () => {
    const store = useChatStore.getState();
    store.source = ChatSourceEnum.share;
    store.setChatId();
    const updatedStore = useChatStore.getState();

    expect(updatedStore.chatId).toBe('test-nanoid');
  });

  it('should set outLinkAuthData', () => {
    const store = useChatStore.getState();
    const authData = { apikey: 'test-key' };
    store.setOutLinkAuthData(authData);
    const updatedStore = useChatStore.getState();

    expect(updatedStore.outLinkAuthData).toEqual(authData);
  });
});

describe('createCustomStorage', () => {
  it('should create storage with appId in key', () => {
    const storage = createCustomStorage();
    const testData = {
      state: {
        source: ChatSourceEnum.share,
        chatId: '123',
        appId: 'app123',
        lastChatId: 'last123',
        lastChatAppId: 'lastApp123'
      },
      version: 0
    };

    storage.setItem('test', JSON.stringify(testData));

    const sessionResult = JSON.parse(sessionStorage.getItem('test_test123') || '{}');
    const localResult = JSON.parse(localStorage.getItem('test_test123') || '{}');

    expect(sessionResult.state).toEqual({
      source: ChatSourceEnum.share,
      chatId: '123',
      appId: 'app123'
    });

    expect(localResult.state).toEqual({
      lastChatId: 'last123',
      lastChatAppId: 'lastApp123'
    });
  });

  it('should remove items from both storages', () => {
    const storage = createCustomStorage();
    const testData = {
      state: {
        source: ChatSourceEnum.share,
        chatId: '123'
      },
      version: 0
    };

    storage.setItem('test', JSON.stringify(testData));
    storage.removeItem('test');

    expect(sessionStorage.getItem('test_test123')).toBeNull();
    expect(localStorage.getItem('test_test123')).toBeNull();
  });
});
