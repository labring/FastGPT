import { create, createJSONStorage, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import { getNanoid } from '@fastgpt/global/common/string/tools';

type State = {
  skillId: string;
  chatId: string;
  selectedModel: string;
  /** 每个 Skill 最近一次打开的调试 chatId，用于切换 Skill 时恢复会话 */
  skillChatIdMap: Record<string, string>;
  /** 每个 Skill 最近一次使用的调试模型，用于恢复调试偏好 */
  skillModelMap: Record<string, string>;
  setSkillId: (skillId: string) => void;
  setChatId: (chatId?: string) => void;
  setSelectedModel: (model: string) => void;
  resetSkillDebugCache: () => void;
};

export const createSkillDebugChatStorage = () => {
  // 当前 tab 的 active 状态放 sessionStorage；跨 tab 恢复用的 map 放 localStorage。
  const sessionKeys = ['skillId', 'chatId', 'selectedModel'];

  return {
    getItem: (name: string) => {
      const sessionData = JSON.parse(sessionStorage.getItem(name) || '{}');
      const localData = JSON.parse(localStorage.getItem(name) || '{}');

      return JSON.stringify({
        version: 0,
        state: {
          ...localData.state,
          ...sessionData.state
        }
      });
    },
    setItem: (name: string, value: string) => {
      const data = JSON.parse(value);

      const sessionData = Object.fromEntries(
        Object.entries(data.state).filter(([key]) => sessionKeys.includes(key))
      );
      const localData = Object.fromEntries(
        Object.entries(data.state).filter(([key]) => !sessionKeys.includes(key))
      );

      if (Object.keys(sessionData).length > 0) {
        sessionStorage.setItem(name, JSON.stringify({ state: sessionData, version: 0 }));
      }
      if (Object.keys(localData).length > 0) {
        localStorage.setItem(name, JSON.stringify({ state: localData, version: 0 }));
      }
    },
    removeItem: (name: string) => {
      sessionStorage.removeItem(name);
      localStorage.removeItem(name);
    }
  };
};

export const useSkillDebugChatStore = create<State>()(
  devtools(
    persist(
      immer((set) => ({
        skillId: '',
        chatId: '',
        selectedModel: '',
        skillChatIdMap: {},
        skillModelMap: {},
        setSkillId(skillId) {
          if (!skillId) return;

          set((state) => {
            const isSameSkill = state.skillId === skillId;

            if (state.skillId && !isSameSkill) {
              if (state.chatId) {
                state.skillChatIdMap[state.skillId] = state.chatId;
              }
              if (state.selectedModel) {
                state.skillModelMap[state.skillId] = state.selectedModel;
              }
            }

            const nextChatId =
              (isSameSkill ? state.chatId : undefined) ||
              state.skillChatIdMap[skillId] ||
              getNanoid(24);
            const nextModel =
              (isSameSkill ? state.selectedModel : undefined) || state.skillModelMap[skillId] || '';

            state.skillId = skillId;
            state.chatId = nextChatId;
            state.selectedModel = nextModel;
            state.skillChatIdMap[skillId] = nextChatId;
            if (nextModel) {
              state.skillModelMap[skillId] = nextModel;
            }
          });
        },
        setChatId(chatId) {
          const nextChatId = chatId || getNanoid(24);

          set((state) => {
            if (!state.skillId) return;

            state.chatId = nextChatId;
            state.skillChatIdMap[state.skillId] = nextChatId;
          });
        },
        setSelectedModel(model) {
          set((state) => {
            state.selectedModel = model;
            if (state.skillId && model) {
              state.skillModelMap[state.skillId] = model;
            }
          });
        },
        resetSkillDebugCache() {
          set((state) => {
            state.skillId = '';
            state.chatId = '';
            state.selectedModel = '';
            state.skillChatIdMap = {};
            state.skillModelMap = {};
          });
        }
      })),
      {
        name: 'skillDebugChatStore',
        storage: createJSONStorage(createSkillDebugChatStorage),
        partialize: (state) => ({
          skillId: state.skillId,
          chatId: state.chatId,
          selectedModel: state.selectedModel,
          skillChatIdMap: state.skillChatIdMap,
          skillModelMap: state.skillModelMap
        })
      }
    )
  )
);
