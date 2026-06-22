import React, { useEffect, useMemo, useRef } from 'react';
import { createContext } from 'use-context-selector';

export type QuickReplyContextValue = {
  enableQuickReplies?: boolean;
  onQuickReplyClick?: (text: string) => void;
};

export const QuickReplyContext = createContext<QuickReplyContextValue>({});

type QuickReplyHandlerRegistryContextValue = {
  setHandler: (handler?: (text: string) => void) => void;
};

const QuickReplyHandlerRegistryContext = React.createContext<QuickReplyHandlerRegistryContextValue>(
  {
    setHandler: () => {}
  }
);

export const QuickReplyContextProvider = ({
  enableQuickReplies,
  children
}: {
  enableQuickReplies?: boolean;
  children: React.ReactNode;
}) => {
  const handlerRef = useRef<(text: string) => void>();

  const value = useMemo(
    () => ({
      enableQuickReplies,
      onQuickReplyClick: enableQuickReplies
        ? (text: string) => handlerRef.current?.(text)
        : undefined
    }),
    [enableQuickReplies]
  );

  const registryValue = useMemo(
    () => ({
      setHandler: (handler?: (text: string) => void) => {
        handlerRef.current = handler;
      }
    }),
    []
  );

  return (
    <QuickReplyHandlerRegistryContext.Provider value={registryValue}>
      <QuickReplyContext.Provider value={value}>{children}</QuickReplyContext.Provider>
    </QuickReplyHandlerRegistryContext.Provider>
  );
};

/** ChatBox 内部注册快捷回复点击处理函数。 */
export const useRegisterQuickReplyClickHandler = (handler?: (text: string) => void) => {
  const { setHandler } = React.useContext(QuickReplyHandlerRegistryContext);

  useEffect(() => {
    setHandler(handler);
    return () => setHandler(undefined);
  }, [handler, setHandler]);
};
