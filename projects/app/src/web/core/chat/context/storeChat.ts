import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type State = {
  appId: string;
  setAppId: (e: string) => any;
  lastChatAppId: string;
  setLastChatAppId: (e: string) => any;

  chatId: string;
  setChatId: (e?: string) => any;

  outLinkAuthData: OutLinkChatAuthProps;
  setOutLinkAuthData: (e: OutLinkChatAuthProps) => any;
};

export const useChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        appId: '',
        setAppId(e) {
          set((state) => {
            state.appId = e;
          });
        },
        chatId: '',
        setChatId(e = getNanoid(24)) {
          set((state) => {
            state.chatId = e;
          });
        },
        lastChatAppId: '',
        setLastChatAppId(e) {
          set((state) => {
            state.lastChatAppId = e;
          });
        },
        outLinkAuthData: {},
        setOutLinkAuthData(e) {
          set((state) => {
            state.outLinkAuthData = e;
          });
        }
      })),
      {
        name: 'chatStore',
        partialize: (state) => ({
          chatId: state.chatId,
          lastChatAppId: state.lastChatAppId
        })
      }
    )
  )
);
