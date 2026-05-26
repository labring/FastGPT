import { create, createJSONStorage, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';

type State = {
  source?: `${ChatSourceEnum}`;
  setSource: (e: `${ChatSourceEnum}`) => any;

  appId: string;
  setAppId: (e: string) => any;
  lastChatAppId: string;
  setLastChatAppId: (e: string) => any;

  lastChatId: string;
  chatId: string;
  setChatId: (e?: string) => any;
  /** 每个应用最近一次打开的 chatId，用于切换应用时恢复会话 */
  appChatIdMap: Record<string, string>;

  lastPane: ChatSidebarPaneEnum;
  setLastPane: (e: ChatSidebarPaneEnum) => any;

  outLinkAuthData: OutLinkChatAuthProps;
  setOutLinkAuthData: (e: OutLinkChatAuthProps) => any;

  resetChatCache: () => any;
};

/**
 * 生成按应用恢复会话用的缓存 key。
 *
 * 普通会话按 source + appId 隔离；分享会话的权限边界是 shareId + outLinkUid，
 * 因此分享缓存 key 必须包含完整外链身份，避免同 app 下不同分享链接或外链用户串用 chatId。
 */
const getAppChatIdCacheKey = ({
  source,
  appId,
  outLinkAuthData
}: {
  source?: `${ChatSourceEnum}`;
  appId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  if (!source || !appId) return;
  if (source === ChatSourceEnum.share) {
    const { shareId, outLinkUid } = outLinkAuthData || {};
    if (!shareId || !outLinkUid) return;
    return `${source}:${shareId}:${outLinkUid}:${appId}`;
  }
  return `${source}:${appId}`;
};

const createCustomStorage = () => {
  // source/chatId/appId 跟当前 tab 绑定，放 sessionStorage；其余跨 tab 共享字段放 localStorage
  const sessionKeys = ['source', 'chatId', 'appId'];

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

      // 分离 session 和 local 数据
      const sessionData = Object.fromEntries(
        Object.entries(data.state).filter(([key]) => sessionKeys.includes(key))
      );
      const localData = Object.fromEntries(
        Object.entries(data.state).filter(([key]) => !sessionKeys.includes(key))
      );

      // 分别存储
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

/*
  appId chatId source 存在当前 tab 中，刷新浏览器不会丢失。
  lastChatId 和 lastChatAppId 全局存储，切换 tab 或浏览器也不会丢失。用于首次 tab 进入对话时，恢复上一次的 chat。(只恢复相同来源的)
*/
export const useChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        source: undefined,
        setSource(e) {
          set((state) => {
            // 分享会话的恢复必须依赖 shareId + outLinkUid，不能只靠 lastChatId 的 source 前缀。
            if (
              e !== ChatSourceEnum.share &&
              !state.chatId &&
              state.lastChatId &&
              state.lastChatId.startsWith(e)
            ) {
              state.chatId = state.lastChatId.split('-')[1];
            } else if (e !== get().source) {
              // 来源改变，强制重置 chatId
              state.chatId = getNanoid(24);
            }

            state.source = e;
          });
        },
        appId: '',
        setAppId(e) {
          if (!e) return;

          set((state) => {
            if (state.appId !== e) {
              const currentCacheKey = getAppChatIdCacheKey({
                source: state.source,
                appId: state.appId,
                outLinkAuthData: state.outLinkAuthData
              });
              if (currentCacheKey && state.chatId) {
                state.appChatIdMap[currentCacheKey] = state.chatId;
              }
              // 切换到目标应用：优先恢复该应用上次的 chatId，否则临时生成（待历史列表加载后再对齐）
              const nextCacheKey = getAppChatIdCacheKey({
                source: state.source,
                appId: e,
                outLinkAuthData: state.outLinkAuthData
              });
              const restoredChatId = nextCacheKey ? state.appChatIdMap[nextCacheKey] : undefined;
              state.chatId = restoredChatId || getNanoid(24);
              if (state.source) {
                state.lastChatId = `${state.source}-${state.chatId}`;
              }
            }
            state.appId = e;
            state.lastChatAppId = e;
          });
        },
        lastChatId: '',
        chatId: '',
        appChatIdMap: {},
        setChatId(e) {
          const id = e || getNanoid(24);
          set((state) => {
            state.chatId = id;
            state.lastChatId = `${state.source}-${id}`;
            const cacheKey = getAppChatIdCacheKey({
              source: state.source,
              appId: state.appId,
              outLinkAuthData: state.outLinkAuthData
            });
            if (cacheKey) {
              state.appChatIdMap[cacheKey] = id;
            }
          });
        },
        lastChatAppId: '',
        setLastChatAppId(e) {
          set((state) => {
            state.lastChatAppId = e;
          });
        },
        lastPane: ChatSidebarPaneEnum.HOME,
        setLastPane(e) {
          set((state) => {
            state.lastPane = e;
          });
        },
        outLinkAuthData: {},
        setOutLinkAuthData(e) {
          set((state) => {
            const currentCacheKey = getAppChatIdCacheKey({
              source: state.source,
              appId: state.appId,
              outLinkAuthData: state.outLinkAuthData
            });
            if (currentCacheKey && state.chatId) {
              state.appChatIdMap[currentCacheKey] = state.chatId;
            }

            state.outLinkAuthData = e;

            const nextCacheKey = getAppChatIdCacheKey({
              source: state.source,
              appId: state.appId,
              outLinkAuthData: e
            });
            if (nextCacheKey) {
              const restoredChatId = state.appChatIdMap[nextCacheKey];
              state.chatId = restoredChatId || state.chatId || getNanoid(24);
              state.lastChatId = `${state.source}-${state.chatId}`;
              state.appChatIdMap[nextCacheKey] = state.chatId;
            }
          });
        },
        resetChatCache() {
          set((state) => {
            state.source = undefined;
            state.appId = '';
            state.lastChatAppId = '';
            state.chatId = '';
            state.lastChatId = '';
            state.appChatIdMap = {};
            state.lastPane = ChatSidebarPaneEnum.HOME;
            state.outLinkAuthData = {};
          });
        }
      })),
      {
        name: 'chatStore',
        storage: createJSONStorage(createCustomStorage),
        partialize: (state) => ({
          source: state.source,
          chatId: state.chatId,
          appId: state.appId,
          lastChatId: state.lastChatId,
          lastChatAppId: state.lastChatAppId,
          lastPane: state.lastPane,
          appChatIdMap: state.appChatIdMap
        })
      }
    )
  )
);

/**
 * 跨 tab 同步 localStorage 中的持久字段（lastChatId、appChatIdMap 等）。
 * sessionStorage 字段（source/chatId/appId）各 tab 独立，不参与 storage 事件合并。
 */
const createStorageListener = (store: any) => {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'chatStore' && e.newValue && e.storageArea === localStorage) {
      try {
        const newData = JSON.parse(e.newValue);
        const currentState = store.getState();

        // 只同步 localStorage 中的数据（非 session 数据）
        const sessionKeys = ['source', 'chatId', 'appId'];
        const updatedState: Partial<State> = {};
        let hasChanges = false;

        Object.entries(newData.state || {}).forEach(([key, value]) => {
          if (!sessionKeys.includes(key) && currentState[key] !== value) {
            (updatedState as any)[key] = value;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          store.setState(updatedState);
        }
      } catch (error) {
        console.warn('Failed to parse storage event data:', error);
      }
    }
  };

  // 添加监听器
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);

    // 返回清理函数
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }

  return () => {};
};

// 初始化存储事件监听器
if (typeof window !== 'undefined') {
  createStorageListener(useChatStore);
}

export { createCustomStorage };
