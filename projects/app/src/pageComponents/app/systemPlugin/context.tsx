import { getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { createContext } from 'use-context-selector';

type SystemPluginContextType = {
  plugins: NodeTemplateListItemType[];
  isLoadingSystemPlugin: boolean;
};

export const SystemPluginContext = createContext<SystemPluginContextType>({
  plugins: [],
  isLoadingSystemPlugin: false
});

const SystemPluginContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: plugins = [], loading: isLoadingPlugins } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });

  const contextValue: SystemPluginContextType = {
    plugins,
    isLoadingSystemPlugin: isLoadingPlugins
  };

  return (
    <SystemPluginContext.Provider value={contextValue}>{children}</SystemPluginContext.Provider>
  );
};

export default SystemPluginContextProvider;
