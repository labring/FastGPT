import React from 'react';
import { createContext } from 'use-context-selector';

export type QuickReplyContextValue = {
  enableQuickReplies?: boolean;
  onQuickReplyClick?: (text: string) => void;
};

export const QuickReplyContext = createContext<QuickReplyContextValue>({});

export const QuickReplyContextProvider = ({
  value,
  children
}: {
  value: QuickReplyContextValue;
  children: React.ReactNode;
}) => {
  return <QuickReplyContext.Provider value={value}>{children}</QuickReplyContext.Provider>;
};
