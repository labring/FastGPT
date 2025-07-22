import { createContext, useContext, useState } from 'react';

export enum ChatSidebarActionEnum {
  HOME = 'home',
  SETTING = 'setting',
  TEAM_APPS = 'team_apps',
  FAVORITE_APPS = 'favorite_apps'
}

export enum ChatSidebarExpandEnum {
  FOLD = 'fold',
  EXPAND = 'expand'
}

export type ChatSidebarContextValueType = {
  action: ChatSidebarActionEnum;
  setAction: (action: ChatSidebarActionEnum) => void;
  expand: ChatSidebarExpandEnum;
  setExpand: (expand: ChatSidebarExpandEnum) => void;
  isFolded: boolean;
};

export const ChatSidebarContext = createContext<ChatSidebarContextValueType | null>(null);

export const useChatSidebarContext = () => {
  const context = useContext(ChatSidebarContext);
  if (!context) {
    throw new Error('useChatSidebarContext must be used within a ChatSidebarContextProvider');
  }
  return context;
};

export const ChatSidebarContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [action, setAction] = useState<ChatSidebarActionEnum>(ChatSidebarActionEnum.HOME);
  const [expand, setExpand] = useState<ChatSidebarExpandEnum>(ChatSidebarExpandEnum.EXPAND);

  const value: ChatSidebarContextValueType = {
    action,
    setAction,
    expand,
    setExpand,
    isFolded: expand === ChatSidebarExpandEnum.FOLD
  };

  return <ChatSidebarContext.Provider value={value}>{children}</ChatSidebarContext.Provider>;
};
