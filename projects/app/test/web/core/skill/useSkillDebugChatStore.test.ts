import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSkillDebugChatStorage,
  useSkillDebugChatStore
} from '@/pageComponents/dashboard/skill/detail/useSkillDebugChatStore';

vi.mock('@fastgpt/global/common/string/tools', () => ({
  getNanoid: () => 'test-generated-id'
}));

const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

vi.stubGlobal('sessionStorage', sessionStorageMock);
vi.stubGlobal('localStorage', localStorageMock);

const resetStore = () => {
  useSkillDebugChatStore.setState({
    skillId: '',
    chatId: '',
    selectedModel: '',
    skillChatIdMap: {},
    skillModelMap: {}
  });
};

describe('useSkillDebugChatStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('restores chatId and model by skill', () => {
    const store = useSkillDebugChatStore.getState();

    store.setSkillId('skill-a');
    store.setChatId('chat-a');
    store.setSelectedModel('model-a');

    store.setSkillId('skill-b');
    store.setChatId('chat-b');
    store.setSelectedModel('model-b');

    store.setSkillId('skill-a');
    expect(useSkillDebugChatStore.getState()).toMatchObject({
      chatId: 'chat-a',
      selectedModel: 'model-a'
    });

    store.setSkillId('skill-b');
    expect(useSkillDebugChatStore.getState()).toMatchObject({
      chatId: 'chat-b',
      selectedModel: 'model-b'
    });
  });

  it('writes generated chatId into skill cache when entering a skill', () => {
    useSkillDebugChatStore.getState().setSkillId('skill-a');

    expect(useSkillDebugChatStore.getState()).toMatchObject({
      chatId: 'test-generated-id',
      skillChatIdMap: {
        'skill-a': 'test-generated-id'
      }
    });
  });
});

describe('createSkillDebugChatStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits active tab state and cross-tab cache state', () => {
    const storage = createSkillDebugChatStorage();

    storage.setItem(
      'skillDebugChatStore',
      JSON.stringify({
        state: {
          skillId: 'skill-a',
          chatId: 'chat-a',
          selectedModel: 'model-a',
          skillChatIdMap: { 'skill-a': 'chat-a' },
          skillModelMap: { 'skill-a': 'model-a' }
        },
        version: 0
      })
    );

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      'skillDebugChatStore',
      JSON.stringify({
        state: {
          skillId: 'skill-a',
          chatId: 'chat-a',
          selectedModel: 'model-a'
        },
        version: 0
      })
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'skillDebugChatStore',
      JSON.stringify({
        state: {
          skillChatIdMap: { 'skill-a': 'chat-a' },
          skillModelMap: { 'skill-a': 'model-a' }
        },
        version: 0
      })
    );
  });
});
