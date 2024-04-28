import { defaultApp } from '@/constants/app';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { useUpdateEffect } from 'ahooks';
import React from 'react';
import { createContext } from 'use-context-selector';

type SimpleEditContextProps = {
  app: AppDetailType;
  setApp: React.Dispatch<React.SetStateAction<AppDetailType>>;
};

export const SimpleEditContext = createContext<SimpleEditContextProps>({
  app: defaultApp,
  setApp: function (value: React.SetStateAction<AppDetailType>): void {
    throw new Error('Function not implemented.');
  }
});

export const SimpleEditProvider = ({ children }: { children: React.ReactNode }) => {
  const { appDetail } = useAppStore();

  // Create a copy
  const [app, setApp] = React.useState(appDetail);

  useUpdateEffect(() => {
    setApp(appDetail);
  }, [appDetail]);

  return (
    <SimpleEditContext.Provider value={{ app, setApp }}>{children}</SimpleEditContext.Provider>
  );
};
