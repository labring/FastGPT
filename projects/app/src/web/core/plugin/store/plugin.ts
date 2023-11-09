import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import { getUserPlugs2ModuleTemplates } from '../api';

type State = {
  pluginModuleTemplates: FlowModuleTemplateType[];
  loadPluginModuleTemplates: (init?: boolean) => Promise<FlowModuleTemplateType[]>;
};

export const usePluginStore = create<State>()(
  devtools(
    immer((set, get) => ({
      pluginModuleTemplates: [],
      async loadPluginModuleTemplates(init) {
        if (!init && get().pluginModuleTemplates.length > 0) {
          return get().pluginModuleTemplates;
        }
        const templates = await getUserPlugs2ModuleTemplates();
        set((state) => {
          state.pluginModuleTemplates = templates;
        });
        return templates;
      }
    }))
  )
);
