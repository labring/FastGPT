import { getPluginGroups } from '@/web/core/app/api/plugin';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useState } from 'react';
import { createContext } from 'use-context-selector';

type StudioContextType = {
  sidebarWidth: number;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
  pluginGroups: PluginGroupSchemaType[];
};

export const StudioContext = createContext<StudioContextType>({
  sidebarWidth: 0,
  setSidebarWidth: function (value: React.SetStateAction<number>): void {
    throw new Error('Function not implemented.');
  },
  searchKey: '',
  setSearchKey: function (value: React.SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  pluginGroups: []
});

const StudioContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [searchKey, setSearchKey] = useState('');

  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });

  const contextValue: StudioContextType = {
    pluginGroups,
    sidebarWidth,
    searchKey,
    setSearchKey,
    setSidebarWidth
  };

  return <StudioContext.Provider value={contextValue}>{children}</StudioContext.Provider>;
};

export default StudioContextProvider;
